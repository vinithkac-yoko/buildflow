import { idbDelete, idbGet, idbGetAll, idbPut } from "./db";
import { isOffline, isNetworkError } from "./net";

/** What can be created without a signal. Each is idempotent on the server by its `clientTxnId`. */
export type OutboxType = "dpr.save" | "dpr.submit" | "issue.add" | "mr.create" | "inspection.request" | "photo";

export type OutboxStatus = "pending" | "syncing" | "conflict" | "error";

export interface OutboxItem {
  clientTxnId: string;
  seq: number;
  type: OutboxType;
  projectId: string;
  /** The IST date the report was made for (daily report and photos). */
  reportDate?: string;
  payload: unknown;
  /** Photos only. */
  blob?: Blob;
  fileName?: string;
  label: string;
  createdAt: number;
  status: OutboxStatus;
  message?: string;
  attempts: number;
}

export interface SyncResult { clientTxnId: string; status: "synced" | "conflict" | "error"; message?: string; fieldErrors?: Record<string, string> }

const CHANNEL = "bf-outbox";
const bus = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach((l) => l()); bus?.postMessage("changed"); };
bus?.addEventListener("message", () => listeners.forEach((l) => l()));
export const subscribeOutbox = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export const newTxnId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function listOutbox(): Promise<OutboxItem[]> {
  try { return (await idbGetAll<OutboxItem>("outbox")).sort((a, b) => a.seq - b.seq); } catch { return []; }
}

/**
 * Put a record on the phone to be sent later. Re-using a `clientTxnId` replaces the earlier copy (so autosaving the same
 * report keeps one entry: the latest) but keeps its place in the queue.
 */
export async function enqueue(item: Omit<OutboxItem, "seq" | "status" | "attempts" | "createdAt"> & { createdAt?: number }): Promise<OutboxItem> {
  const existing = await idbGet<OutboxItem>("outbox", item.clientTxnId).catch(() => undefined);
  const all = await listOutbox();
  const row: OutboxItem = {
    ...item, seq: existing?.seq ?? (all.reduce((m, x) => Math.max(m, x.seq), 0) + 1), createdAt: item.createdAt ?? Date.now(), status: "pending", attempts: existing?.attempts ?? 0,
  };
  await idbPut("outbox", row);
  emit();
  return row;
}

export async function removeFromOutbox(clientTxnId: string) { await idbDelete("outbox", clientTxnId).catch(() => undefined); emit(); }

async function patch(clientTxnId: string, p: Partial<OutboxItem>) {
  const cur = await idbGet<OutboxItem>("outbox", clientTxnId).catch(() => undefined);
  if (cur) await idbPut("outbox", { ...cur, ...p });
}

/** Put a conflicted / failed item back in the queue for another try. */
export async function retryItem(clientTxnId: string) { await patch(clientTxnId, { status: "pending", message: undefined }); emit(); }

let draining = false;

/**
 * Send everything waiting, in the order it was made. Stops quietly if the connection drops. Items the server refuses are kept,
 * marked "conflict" or "error" with the server's message, and shown to the engineer — nothing is dropped silently.
 */
export async function drain(): Promise<{ synced: number; blocked: number } | null> {
  if (draining || isOffline()) return null;
  draining = true;
  let synced = 0;
  try {
    const queue = (await listOutbox()).filter((i) => i.status === "pending" || i.status === "syncing");
    for (const item of queue) {
      if (isOffline()) break;
      await patch(item.clientTxnId, { status: "syncing", attempts: item.attempts + 1 });
      emit();
      let result: SyncResult;
      try {
        result = await send(item);
      } catch (e) {
        await patch(item.clientTxnId, { status: "pending" }); // no signal: try again later
        emit();
        if (isNetworkError(e)) break;
        await patch(item.clientTxnId, { status: "error", message: "Something went wrong sending this. Tap Try again." });
        continue;
      }
      if (result.status === "synced") { await idbDelete("outbox", item.clientTxnId); synced += 1; }
      else await patch(item.clientTxnId, { status: result.status, message: result.message });
      emit();
    }
  } finally {
    draining = false;
    emit();
  }
  const left = (await listOutbox()).filter((i) => i.status === "conflict" || i.status === "error").length;
  return { synced, blocked: left };
}

async function send(item: OutboxItem): Promise<SyncResult> {
  let res: Response;
  if (item.type === "photo" && item.blob) {
    const form = new FormData();
    form.set("meta", JSON.stringify({ clientTxnId: item.clientTxnId, type: item.type, projectId: item.projectId, reportDate: item.reportDate }));
    form.set("file", new File([item.blob], item.fileName ?? "photo.jpg", { type: item.blob.type || "image/jpeg" }));
    res = await fetch("/api/sync", { method: "POST", body: form });
  } else {
    res = await fetch("/api/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ clientTxnId: item.clientTxnId, type: item.type, projectId: item.projectId, reportDate: item.reportDate, payload: item.payload }] }),
    });
  }
  if (res.status === 401) return { clientTxnId: item.clientTxnId, status: "error", message: "You've been signed out. Sign in again and this will send." };
  if (res.status >= 500) throw new TypeError("server unavailable"); // treat as "try later"
  const body = (await res.json().catch(() => null)) as { results?: SyncResult[]; error?: string } | null;
  const r = body?.results?.[0];
  if (r) return r;
  return { clientTxnId: item.clientTxnId, status: "error", message: body?.error ?? "The server didn't accept this." };
}
