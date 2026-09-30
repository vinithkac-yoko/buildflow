/* BUILDFlow service worker.
 * - Keeps the app shell and the screens a Site Engineer has opened, so they open again without a signal.
 * - Static files (JS, CSS, fonts, icons): cache first. Screens: network first, the saved copy when there is no signal.
 * - Never touches API calls, form posts or server actions: those go straight to the network (the app's outbox handles "no signal").
 * The cache is cleared on sign-out (message "clear"), so the next person on a shared phone never sees the last person's screens.
 */
const VERSION = "v1";
const STATIC = `bf-static-${VERSION}`;
const PAGES = `bf-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

// Screens worth keeping for the site team. Anything else is fetched live.
const KEEP = [/^\/$/, /^\/my-projects$/, /^\/todays-work$/, /^\/dpr(\/[^/]+)?$/, /^\/materials$/, /^\/requests(\/new)?$/, /^\/issues$/, /^\/quality$/, /^\/inspections\/request$/, /^\/photos$/, /^\/more$/, /^\/offline$/];
const keepPath = (p) => KEEP.some((r) => r.test(p));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(new Request(OFFLINE_URL, { credentials: "same-origin" }))).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "clear") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(STATIC)]));
  if (data.type === "warm" && Array.isArray(data.urls)) event.waitUntil(warm(data.urls));
});

// Fetch each screen now (while there is a signal), keep it, and keep the script and style files it needs, so it opens later without one.
async function warm(urls) {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  for (const path of urls) {
    try {
      if (!keepPath(path)) continue;
      const res = await fetch(new Request(path, { credentials: "same-origin", headers: { Accept: "text/html" } }));
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(new Request(self.location.origin + path), res);
      const assets = new Set(html.match(/\/_next\/static\/[^"'\s\\)]+\.(?:js|css|woff2?)/g) || []);
      for (const a of assets) {
        if (await statics.match(a)) continue;
        try { const r = await fetch(a); if (r.ok) await statics.put(a, r); } catch { /* skip this file */ }
      }
    } catch { /* no signal: the saved copy stays */ }
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // authorised data and uploads: live only

  // Static build files and icons never change under the same URL.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Screens: page loads, and the data fetches Next makes when moving between screens.
  const isPage = req.mode === "navigate";
  const isRsc = req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (!isPage && !isRsc) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGES);
      // Key on the path alone: the query and Next's per-visit tokens differ every time.
      const key = new Request(url.origin + url.pathname + (isRsc ? "?__rsc" : ""));
      try {
        const res = await fetch(req);
        if (res.ok && res.status === 200 && !res.redirected && keepPath(url.pathname)) cache.put(key, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(key);
        if (hit) return hit;
        // Some entry screens only redirect (the DPR list goes straight to the one project's report; the home screen to My Projects).
        if (isPage && (url.pathname === "/dpr" || url.pathname === "/")) {
          const keys = await cache.keys();
          const want = url.pathname === "/dpr" ? /^\/dpr\/[^/]+$/ : /^\/my-projects$/;
          const alt = keys.find((k) => want.test(new URL(k.url).pathname));
          if (alt) return (await cache.match(alt)) || Response.error();
        }
        if (isPage) return (await cache.match(new Request(url.origin + OFFLINE_URL))) || Response.error();
        throw err; // Next then falls back to loading the page normally, which lands on the saved copy above
      }
    })(),
  );
});
