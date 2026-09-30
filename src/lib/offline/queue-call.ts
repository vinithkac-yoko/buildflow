import type { ActionResult } from "@/core/errors";
import { enqueue, removeFromOutbox, type OutboxType } from "./outbox";
import { isNetworkError, isOffline } from "./net";

export interface QueueSpec {
  type: OutboxType;
  projectId: string;
  clientTxnId: string;
  reportDate?: string;
  payload: unknown;
  label: string;
}

/**
 * Run an online action, or — when there is no signal — put the same record on the phone to be sent later.
 * Only "no connection" queues; a refusal from the server (validation, permission) comes back as a normal result.
 */
export async function callOrQueue<T>(spec: QueueSpec, online: () => Promise<ActionResult<T>>): Promise<{ queued: true } | { queued: false; result: ActionResult<T> }> {
  if (isOffline()) {
    await enqueue(spec);
    return { queued: true };
  }
  try {
    return { queued: false, result: await online() };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await enqueue(spec);
    return { queued: true };
  }
}

export { removeFromOutbox };
export const dprKey = (kind: "save" | "submit", projectId: string, reportDate: string) => `dpr.${kind}:${projectId}:${reportDate}`;
