import { ZodError } from "zod";
import { db } from "@/lib/db";
import { dateKey, istToday } from "../dates";
import { AppError } from "../errors";
import { saveDprPhoto } from "../dpr/photos";
import { addIssue, saveDraft, submitDpr } from "../dpr/service";
import { requestInspection } from "../quality/inspections";
import { createMaterialRequest } from "../procurement/requests";
import type { Ctx } from "../types";

export const SYNC_TYPES = ["dpr.save", "dpr.submit", "issue.add", "mr.create", "inspection.request", "photo"] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

export interface SyncItem { clientTxnId: string; type: SyncType; projectId: string; reportDate?: string | null; payload?: unknown }
export interface SyncResult { clientTxnId: string; status: "synced" | "conflict" | "error"; message?: string; fieldErrors?: Record<string, string> }

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Apply one record that was created without a signal. Each type goes through the same service function the online screen uses
 * (same permission checks, same rules), and each is idempotent, so a retry after a lost reply never duplicates anything.
 * A refusal comes back per item with a message; the phone keeps the item and shows it. Nothing is dropped silently.
 */
export async function processSyncItem(ctx: Ctx, item: SyncItem, file?: { buffer: Buffer; name: string; type: string }): Promise<SyncResult> {
  const id = item.clientTxnId;
  try {
    if (!SYNC_TYPES.includes(item.type)) return { clientTxnId: id, status: "error", message: "The app doesn't know how to send this kind of record." };
    if (!item.projectId) return { clientTxnId: id, status: "error", message: "This record isn't tied to a project." };

    // Daily reports and their photos belong to one calendar day. A report made offline and sent after midnight can't quietly land on another day.
    if ((item.type.startsWith("dpr.") || item.type === "photo") && item.reportDate && item.reportDate !== dateKey(istToday(ctx.now))) {
      return {
        clientTxnId: id, status: "conflict",
        message: `This is for the report of ${item.reportDate}, but a report can only be filed for today. Open today's report and enter it again, or discard this one.`,
      };
    }

    const body = asObject(item.payload);
    switch (item.type) {
      case "dpr.save":
        await saveDraft(ctx, item.projectId, body);
        break;
      case "dpr.submit":
        try {
          await submitDpr(ctx, item.projectId, body);
        } catch (e) {
          // A retry after a lost reply: the report is already submitted by this same person, so this is done.
          if (e instanceof AppError && e.code === "CONFLICT") {
            const dpr = await db.dpr.findUnique({ where: { projectId_reportDate: { projectId: item.projectId, reportDate: istToday(ctx.now) } }, select: { status: true, submittedById: true } });
            if (dpr && (dpr.status === "SUBMITTED" || dpr.status === "APPROVED") && dpr.submittedById === ctx.userId) break;
          }
          throw e;
        }
        break;
      case "issue.add":
        await addIssue(ctx, item.projectId, { ...body, clientTxnId: id });
        break;
      case "mr.create":
        await createMaterialRequest(ctx, item.projectId, { ...body, clientTxnId: id });
        break;
      case "inspection.request":
        await requestInspection(ctx, item.projectId, { ...body, clientTxnId: id });
        break;
      case "photo":
        if (!file) return { clientTxnId: id, status: "error", message: "The photo file didn't arrive. Take it again." };
        await saveDprPhoto(ctx, item.projectId, file, { clientTxnId: id });
        break;
    }
    return { clientTxnId: id, status: "synced" };
  } catch (e) {
    if (e instanceof AppError) {
      return { clientTxnId: id, status: e.code === "CONFLICT" ? "conflict" : "error", message: e.message, fieldErrors: e.fieldErrors };
    }
    if (e instanceof ZodError) {
      return { clientTxnId: id, status: "error", message: e.issues[0]?.message ?? "Some details are missing or wrong.", fieldErrors: Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message])) };
    }
    throw e; // unexpected: the caller answers 500 and the phone tries again later
  }
}
