import type { NcrSeverity, NcrStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can, canSeeField, redact } from "../auth/permissions";
import { dateKey } from "../dates";
import { conflict, forbidden, notFound } from "../errors";
import type { Ctx } from "../types";
import { canTransitionNcr, NCR_STATUS_LABEL } from "./calc";
import { correctiveActionInput, rectificationInput, reinspectionInput, reworkCostInput } from "./schemas";

const num = (d: { toString(): string } | null | undefined) => (d === null || d === undefined ? 0 : Number(d.toString()));

/**
 * Move an NCR one step along its life-cycle. The step is claimed with a conditional update on the current status,
 * so two people can't both move it, and the timeline row and audit row commit with it.
 */
async function step(
  ctx: Ctx, ncrId: string, to: NcrStatus, opts: { stepName: string; note?: string | null; data?: Prisma.NcrUpdateManyMutationInput; from?: NcrStatus },
) {
  const head = await db.ncr.findUnique({ where: { id: ncrId }, select: { projectId: true, status: true, code: true, createdAt: true } });
  if (!head) throw notFound("That NCR");
  assertCan(ctx, "update", "ncr", head.projectId);
  const from = opts.from ?? head.status;
  if (!canTransitionNcr(from, to)) {
    throw conflict(head.status === "CLOSED" ? `${head.code} is already closed.` : `${head.code} is at “${NCR_STATUS_LABEL[head.status]}”, so that step isn't available now. Refresh to see the next step.`);
  }
  await db.$transaction(async (tx) => {
    const closing = to === "CLOSED";
    const res = await tx.ncr.updateMany({
      where: { id: ncrId, status: from },
      data: { ...(opts.data ?? {}), status: to, ...(closing ? { closedAt: ctx.now, closureHours: Math.max(1, Math.ceil((ctx.now.getTime() - head.createdAt.getTime()) / 3_600_000)) } : {}) },
    });
    if (res.count === 0) throw conflict(`${head.code} was just moved by someone else. Refresh to see where it is.`);
    await tx.ncrAction.create({ data: { ncrId, step: opts.stepName, note: opts.note ?? null, userId: ctx.userId, createdAt: ctx.now } });
    await writeAudit(tx, ctx, { action: "TRANSITION", entity: "Ncr", entityId: ncrId, projectId: head.projectId, before: { status: from }, after: { status: to, step: opts.stepName } });
  });
}

export async function startCorrectiveAction(ctx: Ctx, ncrId: string, raw: unknown) {
  const { action } = correctiveActionInput.parse(raw);
  await step(ctx, ncrId, "CORRECTIVE_ACTION", { stepName: "CORRECTIVE_ACTION", note: action, data: { correctiveAction: action } });
}

/**
 * Record the rectification. From "Corrective action" this moves the NCR to Rectification; after a failed reinspection the
 * NCR is already at Rectification, so more rework is added to it (time lost accumulates) without changing its status.
 */
export async function recordRectification(ctx: Ctx, ncrId: string, raw: unknown) {
  const { note, timeLostDays } = rectificationInput.parse(raw);
  const head = await db.ncr.findUnique({ where: { id: ncrId }, select: { projectId: true, status: true, code: true } });
  if (!head) throw notFound("That NCR");
  assertCan(ctx, "update", "ncr", head.projectId);
  const label = `${note} (time lost: ${timeLostDays} day${timeLostDays === 1 ? "" : "s"})`;
  if (head.status !== "RECTIFICATION") {
    await step(ctx, ncrId, "RECTIFICATION", { stepName: "RECTIFICATION", note: label, data: { rectificationNote: note, timeLostDays } });
    return;
  }
  await db.$transaction(async (tx) => {
    const res = await tx.ncr.updateMany({ where: { id: ncrId, status: "RECTIFICATION" }, data: { rectificationNote: note, timeLostDays: { increment: timeLostDays } } });
    if (res.count === 0) throw conflict(`${head.code} was just moved by someone else. Refresh to see where it is.`);
    await tx.ncrAction.create({ data: { ncrId, step: "RECTIFICATION", note: label, userId: ctx.userId, createdAt: ctx.now } });
    await writeAudit(tx, ctx, { action: "UPDATE", entity: "Ncr", entityId: ncrId, projectId: head.projectId, after: { rectification: note, addedTimeLostDays: timeLostDays } });
  });
}

export async function requestReinspection(ctx: Ctx, ncrId: string) {
  await step(ctx, ncrId, "REINSPECTION", { stepName: "REINSPECTION_REQUESTED" });
}

/** Reinspection: a pass closes the NCR (closure time recorded); a fail sends it back to rectification. */
export async function completeReinspection(ctx: Ctx, ncrId: string, raw: unknown) {
  const { passed, note } = reinspectionInput.parse(raw);
  if (passed) await step(ctx, ncrId, "CLOSED", { stepName: "CLOSED", note: note || "Reinspection passed" });
  else await step(ctx, ncrId, "RECTIFICATION", { stepName: "REINSPECTION_FAILED", note: note || "Reinspection failed — more rework needed" });
}

/** Rework costs are cost data: only roles that may see them (Owner, and the PM on assigned projects) can record them. */
export async function recordReworkCost(ctx: Ctx, ncrId: string, raw: unknown) {
  const input = reworkCostInput.parse(raw);
  const ncr = await db.ncr.findUnique({ where: { id: ncrId }, select: { projectId: true, code: true } });
  if (!ncr) throw notFound("That NCR");
  assertCan(ctx, "update", "rework_cost", ncr.projectId);
  if (!canSeeField(ctx, "labourCost", ncr.projectId) || !canSeeField(ctx, "materialCost", ncr.projectId)) throw forbidden();
  await db.$transaction(async (tx) => {
    await tx.ncr.update({ where: { id: ncrId }, data: { reworkLabourCost: input.labour, reworkMaterialCost: input.material } });
    await tx.ncrAction.create({ data: { ncrId, step: "REWORK_COST", note: "Rework cost recorded", userId: ctx.userId, createdAt: ctx.now } });
    await writeAudit(tx, ctx, { action: "UPDATE", entity: "Ncr", entityId: ncrId, projectId: ncr.projectId, after: { reworkLabourCost: input.labour, reworkMaterialCost: input.material } });
  });
}

const listInclude = {
  project: { select: { code: true, name: true } },
  activity: { select: { code: true, name: true } },
  subcontractor: { select: { name: true } },
  raisedBy: { select: { name: true } },
} satisfies Prisma.NcrInclude;

export async function listNcrs(ctx: Ctx, f: { projectId?: string; open?: boolean; status?: NcrStatus; severity?: NcrSeverity } = {}) {
  assertCan(ctx, "read", "ncr");
  if (f.projectId && !ctx.allProjects && !ctx.projectIds.includes(f.projectId)) return [];
  const rows = await db.ncr.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ?? { in: [...ctx.projectIds] } }),
      ...(f.open ? { status: { not: "CLOSED" as NcrStatus } } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.severity ? { severity: f.severity } : {}),
    },
    include: listInclude,
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
  return rows.map((r) =>
    redact(ctx, {
      id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name,
      activity: r.activity ? `${r.activity.code} ${r.activity.name}` : null, subcontractor: r.subcontractor?.name ?? null, severity: r.severity, defect: r.defect, status: r.status,
      raisedBy: r.raisedBy.name, createdAt: r.createdAt.toISOString(), closedAt: r.closedAt?.toISOString() ?? null, closureHours: r.closureHours,
      timeLostDays: num(r.timeLostDays), reworkLabourCost: num(r.reworkLabourCost), reworkMaterialCost: num(r.reworkMaterialCost),
    }, r.projectId),
  );
}
export type NcrRow = Awaited<ReturnType<typeof listNcrs>>[number];

export async function getNcr(ctx: Ctx, id: string) {
  const r = await db.ncr.findUnique({
    where: { id },
    include: { ...listInclude, inspection: { select: { id: true, code: true, totalCheckpoints: true, passedCheckpoints: true } }, actions: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!r) throw notFound("That NCR");
  assertCan(ctx, "read", "ncr", r.projectId);
  const canStep = can(ctx, "update", "ncr", r.projectId);
  return redact(ctx, {
    id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name,
    activity: r.activity ? `${r.activity.code} ${r.activity.name}` : null, subcontractor: r.subcontractor?.name ?? null, severity: r.severity, defect: r.defect, status: r.status,
    correctiveAction: r.correctiveAction, rectificationNote: r.rectificationNote, timeLostDays: num(r.timeLostDays),
    reworkLabourCost: num(r.reworkLabourCost), reworkMaterialCost: num(r.reworkMaterialCost),
    raisedBy: r.raisedBy.name, createdAt: r.createdAt.toISOString(), closedAt: r.closedAt?.toISOString() ?? null, closureHours: r.closureHours,
    inspection: r.inspection,
    actions: r.actions.map((a) => ({ id: a.id, step: a.step, note: a.note, by: a.user.name, at: a.createdAt.toISOString() })),
    canStep, canCost: can(ctx, "update", "rework_cost", r.projectId) && canSeeField(ctx, "labourCost", r.projectId),
  }, r.projectId);
}
export type NcrDetail = Awaited<ReturnType<typeof getNcr>>;

/** Portfolio-friendly counts for the quality overview and the health score. */
export async function qualityOverview(ctx: Ctx) {
  assertCan(ctx, "read", "inspection");
  const scopeWhere = ctx.allProjects ? {} : { projectId: { in: [...ctx.projectIds] } };
  const [open, closed, inspections, requested] = await Promise.all([
    db.ncr.groupBy({ by: ["severity"], where: { ...scopeWhere, status: { not: "CLOSED" } }, _count: true }),
    db.ncr.aggregate({ where: { ...scopeWhere, status: "CLOSED" }, _count: true, _avg: { closureHours: true } }),
    db.qualityInspection.groupBy({ by: ["result"], where: { ...scopeWhere, status: "COMPLETED" }, _count: true }),
    db.qualityInspection.count({ where: { ...scopeWhere, status: "REQUESTED" } }),
  ]);
  const sev = (s: NcrSeverity) => open.find((o) => o.severity === s)?._count ?? 0;
  const res = (r: string) => inspections.find((i) => i.result === r)?._count ?? 0;
  const total = inspections.reduce((s, i) => s + i._count, 0);
  return {
    openNcr: { MINOR: sev("MINOR"), MAJOR: sev("MAJOR"), CRITICAL: sev("CRITICAL") },
    closedNcr: closed._count, avgClosureHours: closed._avg.closureHours === null ? null : Math.round(closed._avg.closureHours ?? 0),
    inspections: { total, pass: res("PASS"), conditional: res("CONDITIONAL_PASS"), rejected: res("REJECTED_NCR") },
    requested, generatedOn: dateKey(ctx.now),
  };
}
