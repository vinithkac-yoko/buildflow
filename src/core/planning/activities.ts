import type { ActivityStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, redact } from "../auth/permissions";
import { nextCode, zBool, zDate, zId, zNum, zOptId, zOptNum, zText, demoFlag } from "../common";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_TRANSITIONS, canTransitionActivity } from "./transitions";

export const activityInput = z
  .object({
    name: zText("the activity name", 160),
    wbsNodeId: zId("a WBS item"),
    tradeId: zOptId(),
    costCodeId: zOptId(),
    uomId: zId("a unit"),
    plannedQty: zNum("Planned quantity", { gt: 0 }),
    plannedStart: zDate("the planned start"),
    plannedFinish: zDate("the planned finish"),
    plannedMandays: zNum("Planned mandays", { min: 0 }),
    plannedCost: zNum("Planned cost", { min: 0 }),
    targetProductivity: zOptNum("Target productivity", { min: 0 }),
    criticalPath: zBool,
  })
  .refine((v) => v.plannedFinish >= v.plannedStart, { path: ["plannedFinish"], message: "Finish can't be before the start." });

const include = {
  wbsNode: { select: { id: true, code: true, name: true } },
  uom: { select: { id: true, code: true } },
  trade: { select: { id: true, name: true } },
  costCode: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ActivityInclude;

export async function listActivities(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "activity", projectId);
  const rows = await db.activity.findMany({ where: { projectId }, include, orderBy: { code: "asc" } });
  return rows.map((a) => redact(ctx, { ...a, plannedQty: a.plannedQty.toString(), plannedMandays: a.plannedMandays.toString(), plannedCost: a.plannedCost.toString(), targetProductivity: a.targetProductivity?.toString() ?? null }, projectId));
}

export type ActivityListItem = Awaited<ReturnType<typeof listActivities>>[number];

export async function getActivity(ctx: Ctx, activityId: string) {
  const a = await db.activity.findUnique({
    where: { id: activityId },
    include: {
      ...include,
      boqLinks: { include: { boqItem: { select: { id: true, itemCode: true, description: true } } } },
      boms: { include: { material: { select: { id: true, code: true, name: true, uom: { select: { code: true } } } } }, orderBy: { material: { name: "asc" } } },
    },
  });
  if (!a) throw notFound("That activity");
  assertCan(ctx, "read", "activity", a.projectId);
  return redact(
    ctx,
    {
      ...a,
      plannedQty: a.plannedQty.toString(), plannedMandays: a.plannedMandays.toString(), plannedCost: a.plannedCost.toString(),
      targetProductivity: a.targetProductivity?.toString() ?? null,
      boms: a.boms.map((b) => ({ ...b, coefficient: b.coefficient.toString(), wastagePct: b.wastagePct.toString() })),
    },
    a.projectId,
  );
}

const snap = (o: object) => JSON.parse(JSON.stringify(o)) as Record<string, string>;

async function checkRefs(tx: Prisma.TransactionClient, projectId: string, i: z.infer<typeof activityInput>) {
  const wbs = await tx.wbsNode.findUnique({ where: { id: i.wbsNodeId } });
  if (!wbs || wbs.projectId !== projectId) throw validation("Pick a WBS item that belongs to this project.");
  if (!(await tx.uom.findUnique({ where: { id: i.uomId } }))) throw validation("Pick a valid unit.");
  if (i.tradeId && !(await tx.trade.findUnique({ where: { id: i.tradeId } }))) throw validation("Pick a valid trade.");
  if (i.costCodeId && !(await tx.costCode.findUnique({ where: { id: i.costCodeId } }))) throw validation("Pick a valid cost code.");
}

export async function createActivity(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "activity", projectId);
  const i = activityInput.parse(raw);
  return db.$transaction(async (tx) => {
    await checkRefs(tx, projectId, i);
    const code = await nextCode(tx, "ACT", { key: `ACT:${projectId}`, pad: 3 });
    const a = await tx.activity.create({
      data: { ...i, tradeId: i.tradeId ?? null, costCodeId: i.costCodeId ?? null, projectId, code, createdById: ctx.userId, ...demoFlag() },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "Activity", entityId: a.id, projectId, activityId: a.id, after: snap(a) });
    return a.id;
  });
}

export async function updateActivity(ctx: Ctx, activityId: string, raw: unknown) {
  const i = activityInput.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.activity.findUnique({ where: { id: activityId } });
    if (!before) throw notFound("That activity");
    assertCan(ctx, "update", "activity", before.projectId);
    await checkRefs(tx, before.projectId, i);
    const a = await tx.activity.update({
      where: { id: activityId },
      data: { ...i, tradeId: i.tradeId ?? null, costCodeId: i.costCodeId ?? null },
    });
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: "Activity", entityId: activityId, projectId: a.projectId, activityId,
      before: snap(before), after: snap(a),
    });
    return a.id;
  });
}

/** Manual status change (halt / resume / reopen). Progress-driven changes come from DPR approval. */
export async function setActivityStatus(ctx: Ctx, activityId: string, to: ActivityStatus) {
  return db.$transaction(async (tx) => {
    const a = await tx.activity.findUnique({ where: { id: activityId } });
    if (!a) throw notFound("That activity");
    assertCan(ctx, "update", "activity", a.projectId);
    if (!canTransitionActivity(a.status, to)) {
      const allowed = ACTIVITY_TRANSITIONS[a.status].map((s) => ACTIVITY_STATUS_LABEL[s]).join(", ");
      throw conflict(`A ${ACTIVITY_STATUS_LABEL[a.status].toLowerCase()} activity can't move to ${ACTIVITY_STATUS_LABEL[to].toLowerCase()}. Allowed: ${allowed}.`);
    }
    if (a.status === to) return;
    await tx.activity.update({ where: { id: activityId }, data: { status: to } });
    await writeAudit(tx, ctx, {
      action: "STATUS_CHANGE", entity: "Activity", entityId: activityId, projectId: a.projectId, activityId,
      before: { status: a.status }, after: { status: to },
    });
  });
}

// ── Standard material BOM (expected consumption per unit of activity quantity) ──

const bomInput = z.object({
  materialId: zId("a material"),
  coefficient: zNum("Coefficient", { gt: 0 }),
  wastagePct: zNum("Allowable wastage %", { min: 0, max: 100 }),
});

export async function upsertBom(ctx: Ctx, activityId: string, raw: unknown) {
  const i = bomInput.parse(raw);
  return db.$transaction(async (tx) => {
    const a = await tx.activity.findUnique({ where: { id: activityId } });
    if (!a) throw notFound("That activity");
    assertCan(ctx, "update", "activity", a.projectId);
    if (!(await tx.material.findUnique({ where: { id: i.materialId } }))) throw validation("Pick a valid material.");
    const row = await tx.materialBom.upsert({
      where: { activityId_materialId: { activityId, materialId: i.materialId } },
      create: { activityId, ...i },
      update: { coefficient: i.coefficient, wastagePct: i.wastagePct },
    });
    await writeAudit(tx, ctx, { action: "UPSERT", entity: "MaterialBom", entityId: row.id, projectId: a.projectId, activityId, after: snap(row) });
  });
}

export async function removeBom(ctx: Ctx, activityId: string, materialId: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.activity.findUnique({ where: { id: activityId } });
    if (!a) throw notFound("That activity");
    assertCan(ctx, "update", "activity", a.projectId);
    const row = await tx.materialBom.findUnique({ where: { activityId_materialId: { activityId, materialId } } });
    if (!row) return;
    await tx.materialBom.delete({ where: { id: row.id } });
    await writeAudit(tx, ctx, { action: "DELETE", entity: "MaterialBom", entityId: row.id, projectId: a.projectId, activityId, before: snap(row) });
  });
}
