import { expect, test, devices } from "@playwright/test";
import { login } from "./helpers";

// 1x1 JPEG; the app compresses it on the device.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

// Offline work creates a report, an issue, a photo and a request, so it runs once — the reset spec restores the demo afterwards.
test.describe("Milestone 8 — offline PWA and sync", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== "phone-390", "Offline is a phone-first, once-only flow");
  });

  test("the app is installable: manifest, icons and a service worker", async ({ page, request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.name).toBe("BUILDFlow");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((i: { sizes: string; purpose?: string }) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("bf-pages");
    await login(page, "engineer1@buildflow.demo");
    await expect(page.locator('link[rel="manifest"]').first()).toHaveAttribute("href", "/manifest.webmanifest");
  });

  test("work offline, then everything is sent once the connection is back", async ({ page, browser }) => {
    test.setTimeout(240_000);
    // Engineer 2 (Avinashi Road) has no report yet today in the demo data, and no other spec files one for them.
    await login(page, "engineer2@buildflow.demo");
    await page.goto("/dpr");
    await page.waitForURL(/\/dpr\/[a-z0-9]+$/);
    const dprUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("button", { name: "SUBMIT DAILY REPORT" })).toBeVisible();

    // The service worker keeps this screen and the forms the engineer needs, refreshed while online.
    await page.waitForFunction(async () => {
      if (!("caches" in window)) return false;
      const keys = (await (await caches.open("bf-pages-v1")).keys()).map((k) => new URL(k.url).pathname);
      return keys.some((k) => /^\/dpr\/[^/]+$/.test(k)) && keys.includes("/requests/new") && keys.includes("/issues");
    }, undefined, { timeout: 60_000 });

    // Simulate offline from the profile menu (also handy for demos).
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitemcheckbox", { name: /Simulate offline/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Offline \(simulated\)/)).toBeVisible();
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitemcheckbox", { name: /Simulate offline/ }).click(); // back on for the real thing below
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Offline \(simulated\)/)).toHaveCount(0);

    // Really offline: reload the report — it opens from the phone.
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "SUBMIT DAILY REPORT" })).toBeVisible();
    await expect(page.getByText(/You're offline/)).toBeVisible();

    // Fill in the report.
    await page.getByRole("radio", { name: "Cloudy" }).click();
    await page.getByLabel("Quantity done today").nth(0).fill("1");
    await expect(page.getByText(/Saved on your phone .*Will send automatically/)).toBeVisible({ timeout: 15_000 });

    // An issue and a photo, offline.
    await page.getByRole("button", { name: /Report an issue/ }).click();
    await page.getByLabel("What is the problem?").fill("E2E offline: cracked water tank cover");
    await page.getByRole("radio", { name: "High" }).click();
    await page.getByRole("button", { name: "Report issue", exact: true }).click();
    await expect(page.getByText(/Saved on your phone\. It will be sent to your PM automatically/)).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({ name: "site.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await expect(page.getByText("On phone", { exact: true })).toBeVisible({ timeout: 15_000 });

    // Submit: it is kept on the phone.
    await page.getByRole("button", { name: "SUBMIT DAILY REPORT" }).click();
    await expect(page.getByRole("heading", { name: "Report saved on your phone" })).toBeVisible();

    // A material request from another (saved) screen.
    await page.goto("/requests/new");
    await page.getByRole("button", { name: /Pick a material/ }).click();
    await page.getByRole("dialog", { name: "Material" }).getByLabel(/Search/).fill("Wall putty");
    await page.getByRole("option", { name: /Wall putty/ }).click();
    await page.getByLabel("How much?").fill("50");
    await page.getByRole("button", { name: "Add to request" }).click();
    await page.getByRole("button", { name: "SEND MATERIAL REQUEST" }).click();
    await expect(page.getByRole("heading", { name: "Request saved on your phone" })).toBeVisible();

    // Reopening the report offline still shows it as saved on the phone (nothing lost, nothing editable twice).
    await page.goto(dprUrl);
    await expect(page.getByRole("heading", { name: "Report saved on your phone" })).toBeVisible();
    await expect(page.getByText(/\d+ waiting to send/)).toBeVisible();
    const waiting = await page.evaluate(() => new Promise<number>((res) => {
      const open = indexedDB.open("buildflow-offline");
      open.onsuccess = () => { const r = open.result.transaction("outbox").objectStore("outbox").count(); r.onsuccess = () => res(r.result); };
    }));
    expect(waiting).toBeGreaterThanOrEqual(4); // issue, photo, report, request

    // Back online: the outbox drains in order and the banner says so.
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText(/All sent/)).toBeVisible({ timeout: 60_000 });
    await page.goto(dprUrl);
    await expect(page.getByText(/waiting for|Sent to|sent for approval/i).first()).toBeVisible({ timeout: 15_000 }); // the server now holds the locked report

    // What the PM sees: the report, the issue and the request all arrived, once.
    const ctx = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } });
    const pm = await ctx.newPage();
    await login(pm, "pm2@buildflow.demo");
    await pm.goto("/progress?status=SUBMITTED");
    await expect(pm.locator("main li").filter({ hasText: "Avinashi Road" }).first()).toBeVisible();
    await pm.goto("/issues");
    await expect(pm.getByText("E2E offline: cracked water tank cover")).toHaveCount(1);
    await pm.goto("/requests?tab=mr");
    await expect(pm.getByText(/Wall putty 50/).first()).toBeVisible();
    await ctx.close();
  });

  test("something the server refuses stays on the phone with the reason; the engineer chooses", async ({ page }) => {
    await login(page, "engineer1@buildflow.demo");
    await page.goto("/my-projects");
    // A report made on another day can't be filed today: it comes back as a conflict and waits for a decision.
    await page.evaluate(async () => {
      const projects = await (await fetch("/api/offline/warm")).json();
      const projectId = String(projects.urls.find((u: string) => u.startsWith("/dpr/"))).split("/").pop();
      await new Promise<void>((res, rej) => {
        const open = indexedDB.open("buildflow-offline", 1);
        open.onerror = () => rej(open.error);
        open.onsuccess = () => {
          const t = open.result.transaction("outbox", "readwrite");
          t.objectStore("outbox").put({
            clientTxnId: "dpr.save:e2e-old-report", seq: 9999, type: "dpr.save", projectId, reportDate: "2020-01-01", label: "Daily report (draft) — E2E old day",
            payload: { weather: "SUNNY", noWork: false, progress: [], labour: [], materials: [] }, createdAt: Date.now(), status: "pending", attempts: 0,
          });
          t.oncomplete = () => res();
        };
      });
      window.dispatchEvent(new Event("online"));
    });
    await page.reload();
    const alert = page.getByRole("alert").filter({ hasText: /needs? your attention/ });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText("E2E old day");
    await expect(alert).toContainText(/only be filed for today/);
    page.once("dialog", (d) => void d.accept());
    await alert.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /needs? your attention/ })).toHaveCount(0);
  });
});
