"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { drain, listOutbox, removeFromOutbox, retryItem, subscribeOutbox, type OutboxItem } from "@/lib/offline/outbox";
import { isOffline, isSimulatedOffline, subscribeNet } from "@/lib/offline/net";
import { cn } from "@/lib/utils";

interface SyncState {
  enabled: boolean;
  offline: boolean;
  simulated: boolean;
  items: OutboxItem[];
  syncing: boolean;
  syncNow: () => void;
  discard: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
}

const NOOP: SyncState = { enabled: false, offline: false, simulated: false, items: [], syncing: false, syncNow: () => undefined, discard: async () => undefined, retry: async () => undefined };
const Ctx = createContext<SyncState>(NOOP);
export const useSync = () => useContext(Ctx);

const WARM_EVERY_MS = 10 * 60_000;

/**
 * Site Engineer's offline layer: registers the service worker, keeps the screens they need saved on the phone,
 * tracks the outbox, and sends it when the connection comes back. Renders the calm "what is happening" banner.
 */
export function SyncProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [offline, setOffline] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [justSent, setJustSent] = useState(0);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => setItems(await listOutbox()), []);
  const syncNow = useCallback(() => {
    if (!enabled) return;
    void (async () => {
      setSyncing(true);
      const r = await drain();
      setSyncing(false);
      await refresh();
      if (r && r.synced > 0) {
        setJustSent(r.synced);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setJustSent(0), 5000);
      }
    })();
  }, [enabled, refresh]);

  // network state
  useEffect(() => {
    const read = () => { setOffline(isOffline()); setSimulated(isSimulatedOffline()); };
    read();
    return subscribeNet(() => { read(); if (!isOffline()) syncNow(); });
  }, [syncNow]);

  // outbox state; send whenever something is waiting and we're online
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    let t: number | undefined;
    const off = subscribeOutbox(() => {
      void refresh();
      window.clearTimeout(t);
      t = window.setTimeout(() => { if (!isOffline()) void listOutbox().then((l) => l.some((i) => i.status === "pending") && syncNow()); }, 400);
    });
    syncNow();
    const every = window.setInterval(() => { if (!isOffline()) void listOutbox().then((l) => l.some((i) => i.status === "pending") && syncNow()); }, 20_000);
    return () => { off(); window.clearInterval(every); window.clearTimeout(t); };
  }, [enabled, refresh, syncNow]);

  // service worker + keeping the site team's screens saved on the phone
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let stop = false;
    const warm = async () => {
      if (isOffline()) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        const res = await fetch("/api/offline/warm", { cache: "no-store" });
        if (!res.ok) return;
        const { urls } = (await res.json()) as { urls: string[] };
        reg.active?.postMessage({ type: "warm", urls });
      } catch { /* offline or blocked: nothing to do */ }
    };
    navigator.serviceWorker.register("/sw.js").then(() => { if (!stop) void warm(); }).catch(() => undefined);
    const every = window.setInterval(() => void warm(), WARM_EVERY_MS);
    return () => { stop = true; window.clearInterval(every); };
  }, [enabled]);

  const value = useMemo<SyncState>(() => ({
    enabled, offline, simulated, items, syncing, syncNow,
    discard: async (id) => { await removeFromOutbox(id); await refresh(); },
    retry: async (id) => { await retryItem(id); await refresh(); syncNow(); },
  }), [enabled, offline, simulated, items, syncing, syncNow, refresh]);

  return (
    <Ctx.Provider value={value}>
      {enabled && <SyncBanner s={value} justSent={justSent} />}
      {children}
    </Ctx.Provider>
  );
}

function SyncBanner({ s, justSent }: { s: SyncState; justSent: number }) {
  const waiting = s.items.filter((i) => i.status === "pending" || i.status === "syncing");
  const blocked = s.items.filter((i) => i.status === "conflict" || i.status === "error");
  const shell = "-mx-4 mb-4 border-b px-4 py-3 text-[15px] md:-mx-8 md:px-8";

  if (blocked.length > 0 && !s.offline) {
    return (
      <div role="alert" className={cn(shell, "border-warn/50 bg-surface")}>
        <p className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />{blocked.length === 1 ? "1 item needs your attention" : `${blocked.length} items need your attention`}</p>
        <ul className="mt-2 space-y-3">
          {blocked.map((i) => (
            <li key={i.clientTxnId} className="rounded-xl border border-border p-3">
              <p className="font-medium">{i.label}</p>
              <p className="text-muted">{i.message ?? "The server didn't accept this."}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => void s.retry(i.clientTxnId)} className="flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl border-2 border-border px-4 font-semibold hover:bg-surface-2"><RefreshCw className="h-4 w-4" aria-hidden />Try again</button>
                <button type="button" onClick={() => { if (window.confirm("Discard this? It has not been sent and can't be brought back.")) void s.discard(i.clientTxnId); }} className="min-h-12 cursor-pointer rounded-xl px-4 font-semibold text-danger hover:bg-surface-2">Discard</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (s.offline) {
    return (
      <div role="status" className={cn(shell, "border-border bg-surface-2")}>
        <p className="flex items-start gap-2"><CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden /><span><strong>{s.simulated ? "Offline (simulated)." : <>You&apos;re offline.</>}</strong> What you enter is saved on this phone and will send when you&apos;re back online.{waiting.length > 0 && <> <span className="num font-semibold">{waiting.length}</span> waiting to send.</>}</span></p>
      </div>
    );
  }
  if (s.syncing || waiting.length > 0) {
    return (
      <div role="status" className={cn(shell, "border-planned/40 bg-surface")}>
        <p className="flex items-center gap-2 text-planned"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /><span>Sending <span className="num font-semibold">{Math.max(waiting.length, 1)}</span> item{waiting.length === 1 ? "" : "s"} saved on your phone…</span>
          {!s.syncing && <button type="button" onClick={s.syncNow} className="ml-auto min-h-12 cursor-pointer rounded-xl px-3 font-semibold hover:bg-surface-2">Send now</button>}</p>
      </div>
    );
  }
  if (justSent > 0) {
    return (
      <div role="status" className={cn(shell, "border-brand-text/40 bg-surface")}>
        <p className="flex items-center gap-2 text-brand-text"><Check className="h-5 w-5" aria-hidden />All sent — <span className="num font-semibold">{justSent}</span> item{justSent === 1 ? "" : "s"} uploaded.</p>
      </div>
    );
  }
  return null;
}
