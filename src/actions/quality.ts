"use server";

import { toResult } from "@/core/common";
import { completeInspection, requestInspection } from "@/core/quality/inspections";
import { completeReinspection, recordReworkCost, recordRectification, requestReinspection, startCorrectiveAction } from "@/core/quality/ncr";
import { requireSession } from "@/lib/auth";

export async function requestInspectionAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => requestInspection(ctx, projectId, payload), "inspection");
}
export async function completeInspectionAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => completeInspection(ctx, projectId, payload), "inspection");
}
export async function correctiveActionAction(ncrId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => startCorrectiveAction(ctx, ncrId, payload), "NCR");
}
export async function rectificationAction(ncrId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => recordRectification(ctx, ncrId, payload), "NCR");
}
export async function requestReinspectionAction(ncrId: string) {
  const { ctx } = await requireSession();
  return toResult(() => requestReinspection(ctx, ncrId), "NCR");
}
export async function reinspectionAction(ncrId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => completeReinspection(ctx, ncrId, payload), "NCR");
}
export async function reworkCostAction(ncrId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => recordReworkCost(ctx, ncrId, payload), "NCR");
}
