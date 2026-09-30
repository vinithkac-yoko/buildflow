"use server";

import { toResult } from "@/core/common";
import { deleteDprPhoto, setPhotoClientVisible } from "@/core/dpr/photos";
import { addIssue, approveDpr, rejectDpr, saveDraft, submitDpr } from "@/core/dpr/service";
import { requireSession } from "@/lib/auth";
import type { Values } from "@/lib/forms";

export async function saveDraftAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => saveDraft(ctx, projectId, payload), "report");
}

export async function submitDprAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => submitDpr(ctx, projectId, payload), "report");
}

export async function approveDprAction(dprId: string) {
  const { ctx } = await requireSession();
  return toResult(() => approveDpr(ctx, dprId), "report");
}

export async function rejectDprAction(dprId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => rejectDpr(ctx, dprId, values.reason), "report");
}

export async function addIssueAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => addIssue(ctx, projectId, payload), "issue");
}

export async function deletePhotoAction(photoId: string) {
  const { ctx } = await requireSession();
  return toResult(() => deleteDprPhoto(ctx, photoId), "photo");
}

export async function setPhotoVisibleAction(photoId: string, visible: boolean) {
  const { ctx } = await requireSession();
  return toResult(() => setPhotoClientVisible(ctx, photoId, visible), "photo");
}

export async function updateIssueStatusAction(issueId: string, to: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED") {
  const { ctx } = await requireSession();
  const { updateIssueStatus } = await import("@/core/issues/service");
  return toResult(() => updateIssueStatus(ctx, issueId, to), "issue");
}
