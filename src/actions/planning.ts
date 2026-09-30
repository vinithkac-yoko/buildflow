"use server";

import type { ActivityStatus } from "@prisma/client";
import { toResult } from "@/core/common";
import { createActivity, removeBom, setActivityStatus, updateActivity, upsertBom } from "@/core/planning/activities";
import { createBoqItem, createBoqRevision, linkActivityBoq, unlinkActivityBoq, updateBoqItem } from "@/core/planning/boq";
import { createWbsNode, deleteWbsNode, renameWbsNode } from "@/core/planning/wbs";
import { requireSession } from "@/lib/auth";
import type { Values } from "@/lib/forms";

export async function createWbsAction(projectId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => createWbsNode(ctx, projectId, values), "WBS item");
}
export async function renameWbsAction(nodeId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => renameWbsNode(ctx, nodeId, values), "WBS item");
}
export async function deleteWbsAction(nodeId: string) {
  const { ctx } = await requireSession();
  return toResult(() => deleteWbsNode(ctx, nodeId), "WBS item");
}

export async function createActivityAction(projectId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => createActivity(ctx, projectId, values), "activity");
}
export async function updateActivityAction(activityId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => updateActivity(ctx, activityId, values), "activity");
}
export async function setActivityStatusAction(activityId: string, to: ActivityStatus) {
  const { ctx } = await requireSession();
  return toResult(() => setActivityStatus(ctx, activityId, to), "activity");
}

export async function upsertBomAction(activityId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => upsertBom(ctx, activityId, values), "BOM line");
}
export async function removeBomAction(activityId: string, materialId: string) {
  const { ctx } = await requireSession();
  return toResult(() => removeBom(ctx, activityId, materialId), "BOM line");
}

export async function createBoqAction(projectId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => createBoqItem(ctx, projectId, values), "BOQ item");
}
export async function updateBoqAction(boqItemId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => updateBoqItem(ctx, boqItemId, values), "BOQ item");
}
export async function createBoqRevisionAction(projectId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => createBoqRevision(ctx, projectId, values), "BOQ revision");
}
export async function linkBoqAction(activityId: string, values: Values) {
  const { ctx } = await requireSession();
  return toResult(() => linkActivityBoq(ctx, activityId, values.boqItemId ?? ""), "link");
}
export async function unlinkBoqAction(activityId: string, boqItemId: string) {
  const { ctx } = await requireSession();
  return toResult(() => unlinkActivityBoq(ctx, activityId, boqItemId), "link");
}
