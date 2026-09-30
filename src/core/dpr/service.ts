import { Prisma, type Dpr, type DprStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { istToday } from "../dates";
import { conflict, notFound, validation } from "../errors";
import { findShortages, issueToActivity, shortageMessage } from "../inventory/stock";
import type { Ctx } from "../types";
import { dprInput, issueInput, type DprInput } from "./schemas";
import { DPR_STATUS_LABEL, canTransitionDpr, isEditable } from "./transitions";

type Tx = Prisma.TransactionClient;

const OVERRUN_ALLOWED = 1.1; // an activity may be reported up to 110% of its planned quantity
const num = (d: Prisma.Decimal | number) => Number(d);
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

export interface SaveResult {
  dprId: string;
  status: DprStatus;
  savedAt: string;
}

/** Create today's report for the project if it doesn't exist yet (one per project per day, database-enforced). */
export async function ensureDpr(ctx: Ctx, projectId: string): Promise<Dpr> {
  assertCan(ctx, "create", "dpr", projectId);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { status: true, name: true } });
  if (!project) throw notFound("That project");
  if (project.status !== "ACTIVE" && project.status !== "DELAYED") {
    throw conflict(`${project.name} is not active, so daily reports can't be filed. Ask your Project Manager.`);
  }
  const reportDate = istToday(ctx.now);
  const where = { projectId_reportDate: { projectId, reportDate } } as const;
  const found = await db.dpr.findUnique({ where });
  if (found) return found;
  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.dpr.create({ data: { projectId, reportDate, createdById: ctx.userId, ...demoFlag() } });
      await writeAudit(tx, ctx, { action: "CREATE", entity: "Dpr", entityId: created.id, projectId, after: { reportDate: reportDate.toISOString().slice(0, 10) } });
      return created;
    });
  } catch (e) {
    // Two engineers opened the report at the same moment: the second gets the first one's draft.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.dpr.findUnique({ where });
      if (again) return again;
    }
    throw e;
  }
}

/** Average daily wage per trade, used to cost labour on the server (engineers never see or enter money). */
async function tradeWages(tx: Tx): Promise<Map<string, number>> {
  const [emps, gangs] = await Promise.all([
    tx.employee.findMany({ where: { dailyWage: { not: null }, tradeId: { not: null } }, select: { tradeId: true, dailyWage: true } }),
    tx.contractLabourGang.findMany({ where: { ratePerManday: { not: null } }, select: { tradeId: true, ratePerManday: true } }),
  ]);
  const acc = new Map<string, number[]>();
  for (const e of emps) if (e.tradeId && e.dailyWage) acc.set(e.tradeId, [...(acc.get(e.tradeId) ?? []), num(e.dailyWage)]);
  for (const g of gangs) if (g.ratePerManday) acc.set(g.tradeId, [...(acc.get(g.tradeId) ?? []), num(g.ratePerManday)]);
  return new Map([...acc].map(([t, v]) => [t, v.reduce((s, x) => s + x, 0) / v.length]));
}
const DEFAULT_WAGE = 800;

/** Validate a report's lines against the plan. Collects every problem so the engineer can fix them in one go. */
async function validateLines(tx: Tx, projectId: string, dprId: string, ctx: Ctx, input: DprInput) {
  const errors: Record<string, string> = {};
  const activityIds = new Set([...input.progress.map((p) => p.activityId), ...input.labour.flatMap((l) => (l.activityId ? [l.activityId] : [])), ...input.materials.map((m) => m.activityId)]);
  const activities = await tx.activity.findMany({
    where: { id: { in: [...activityIds] } },
    include: { uom: { select: { code: true } } },
  });
  const byId = new Map(activities.map((a) => [a.id, a]));
  const ok = (id: string) => byId.get(id)?.projectId === projectId;

  const seen = new Set<string>();
  input.progress.forEach((p, i) => {
    if (!ok(p.activityId)) errors[`progress.${i}.activityId`] = "That activity isn't part of this project.";
    else if (seen.has(p.activityId)) errors[`progress.${i}.activityId`] = "This activity is listed twice. Combine the quantities into one line.";
    seen.add(p.activityId);
  });

  // Quantity checks: other engineers' rows in the same report count too.
  const others = await tx.dprActivityProgress.groupBy({
    by: ["activityId"], where: { dprId, enteredById: { not: ctx.userId } }, _sum: { quantity: true },
  });
  const otherQty = new Map(others.map((o) => [o.activityId, num(o._sum.quantity ?? 0)]));
  input.progress.forEach((p, i) => {
    const a = byId.get(p.activityId);
    if (!a || a.projectId !== projectId || errors[`progress.${i}.activityId`]) return;
    const planned = num(a.plannedQty);
    const done = num(a.actualQty) + (otherQty.get(a.id) ?? 0);
    const room = planned * OVERRUN_ALLOWED - done;
    if (p.quantity > room + 1e-9) {
      const left = Math.max(0, planned - done);
      errors[`progress.${i}.quantity`] =
        `Only ${fmt(left)} ${a.uom.code} left on ${a.name} (planned ${fmt(planned)}, done ${fmt(done)}). ` +
        `Enter ${fmt(Math.max(0, room))} or less, or ask your PM to raise the planned quantity.`;
    }
  });

  const tradeIds = [...new Set(input.labour.map((l) => l.tradeId))];
  const subIds = [...new Set(input.labour.flatMap((l) => (l.subcontractorId ? [l.subcontractorId] : [])))];
  const [trades, subs] = await Promise.all([
    tx.trade.findMany({ where: { id: { in: tradeIds } }, select: { id: true } }),
    tx.subcontractor.findMany({ where: { id: { in: subIds } }, select: { id: true } }),
  ]);
  const tradeOk = new Set(trades.map((t) => t.id));
  const subOk = new Set(subs.map((s) => s.id));
  input.labour.forEach((l, i) => {
    if (!tradeOk.has(l.tradeId)) errors[`labour.${i}.tradeId`] = "Pick a valid trade.";
    if (l.activityId && !ok(l.activityId)) errors[`labour.${i}.activityId`] = "That activity isn't part of this project.";
    if (l.source === "SUBCONTRACTOR" && !l.subcontractorId) errors[`labour.${i}.subcontractorId`] = "Pick the subcontractor.";
    if (l.subcontractorId && !subOk.has(l.subcontractorId)) errors[`labour.${i}.subcontractorId`] = "Pick a valid subcontractor.";
  });

  const matIds = [...new Set(input.materials.map((m) => m.materialId))];
  const mats = await tx.material.findMany({ where: { id: { in: matIds }, status: "ACTIVE" }, select: { id: true } });
  const matOk = new Set(mats.map((m) => m.id));
  const seenMat = new Set<string>();
  input.materials.forEach((m, i) => {
    if (!matOk.has(m.materialId)) errors[`materials.${i}.materialId`] = "Pick a valid material.";
    if (!ok(m.activityId)) errors[`materials.${i}.activityId`] = "That activity isn't part of this project.";
    const k = `${m.activityId}:${m.materialId}`;
    if (seenMat.has(k)) errors[`materials.${i}.materialId`] = "This material is listed twice for the same activity. Combine the quantities.";
    seenMat.add(k);
  });

  if (Object.keys(errors).length > 0) {
    const first = Object.values(errors)[0];
    const more = Object.keys(errors).length - 1;
    throw validation(more > 0 ? `${first} (and ${more} more to fix.)` : first, errors);
  }
}

async function lockDpr(tx: Tx, dprId: string) {
  await tx.$queryRaw`SELECT id FROM "Dpr" WHERE id = ${dprId} FOR UPDATE`;
  const dpr = await tx.dpr.findUnique({ where: { id: dprId } });
  if (!dpr) throw notFound("That report");
  return dpr;
}

/** Replace the caller's own rows in the report with the payload. Other engineers' rows are left alone. */
async function applyDraft(tx: Tx, ctx: Ctx, dpr: Dpr, input: DprInput) {
  if (!isEditable(dpr.status)) {
    const by = dpr.submittedById ? await tx.user.findUnique({ where: { id: dpr.submittedById }, select: { name: true } }) : null;
    throw conflict(
      dpr.status === "APPROVED"
        ? "Today's report was already approved, so it can't be changed."
        : `Today's report was already submitted${by ? ` by ${by.name}` : ""} and is waiting for the PM. It can't be changed unless the PM sends it back.`,
    );
  }
  await validateLines(tx, dpr.projectId, dpr.id, ctx, input);
  const wages = await tradeWages(tx);

  await tx.dprActivityProgress.deleteMany({ where: { dprId: dpr.id, enteredById: ctx.userId } });
  await tx.labourLog.deleteMany({ where: { dprId: dpr.id, enteredById: ctx.userId } });
  await tx.dprMaterialUse.deleteMany({ where: { dprId: dpr.id, enteredById: ctx.userId } });

  if (input.progress.length)
    await tx.dprActivityProgress.createMany({
      data: input.progress.map((p) => ({ dprId: dpr.id, projectId: dpr.projectId, activityId: p.activityId, quantity: p.quantity, enteredById: ctx.userId })),
    });
  if (input.labour.length)
    await tx.labourLog.createMany({
      data: input.labour.map((l) => {
        const mandays = (l.headcount * l.hours) / 8;
        return {
          dprId: dpr.id, projectId: dpr.projectId, activityId: l.activityId ?? null, source: l.source, tradeId: l.tradeId,
          subcontractorId: l.source === "SUBCONTRACTOR" ? (l.subcontractorId ?? null) : null,
          headcount: l.headcount, hours: l.hours, mandays: Number(mandays.toFixed(3)),
          dailyLabourCost: Number((mandays * (wages.get(l.tradeId) ?? DEFAULT_WAGE)).toFixed(2)), enteredById: ctx.userId,
        };
      }),
    });
  if (input.materials.length)
    await tx.dprMaterialUse.createMany({
      data: input.materials.map((m) => ({ dprId: dpr.id, projectId: dpr.projectId, activityId: m.activityId, materialId: m.materialId, quantity: m.quantity, enteredById: ctx.userId })),
    });

  return tx.dpr.update({
    where: { id: dpr.id },
    data: {
      weather: input.weather ?? dpr.weather,
      remarks: input.remarks === undefined ? dpr.remarks : input.remarks || null,
      noWork: input.noWork,
      status: dpr.status === "REJECTED" ? "DRAFT" : dpr.status,
      clientTxnId: dpr.clientTxnId ?? input.clientTxnId ?? null,
    },
  });
}

const summarise = (i: DprInput) => ({ activities: i.progress.length, labourLines: i.labour.length, materialLines: i.materials.length });

/** Autosave. Idempotent: the same payload twice leaves the same report. */
export async function saveDraft(ctx: Ctx, projectId: string, raw: unknown): Promise<SaveResult> {
  const input = dprInput.parse(raw);
  const base = await ensureDpr(ctx, projectId);
  return db.$transaction(async (tx) => {
    const dpr = await lockDpr(tx, base.id);
    const updated = await applyDraft(tx, ctx, dpr, input);
    await writeAudit(tx, ctx, { action: "SAVE_DRAFT", entity: "Dpr", entityId: dpr.id, projectId, after: summarise(input) });
    return { dprId: dpr.id, status: updated.status, savedAt: ctx.now.toISOString() };
  });
}

/** Save and submit in one step. The first submitter locks the report. */
export async function submitDpr(ctx: Ctx, projectId: string, raw: unknown): Promise<SaveResult & { pmName: string | null }> {
  const input = dprInput.parse(raw);
  const base = await ensureDpr(ctx, projectId);
  return db.$transaction(async (tx) => {
    const dpr = await lockDpr(tx, base.id);
    const updated = await applyDraft(tx, ctx, dpr, input);

    const totalQty = (await tx.dprActivityProgress.aggregate({ where: { dprId: dpr.id }, _sum: { quantity: true } }))._sum.quantity;
    const remarks = (updated.remarks ?? "").trim();
    if (!updated.weather) throw validation("Pick today's weather before submitting.", { weather: "Pick today's weather." });
    if (updated.noWork) {
      if (remarks.length < 3) throw validation("Say why no work was done today (for example rain or a holiday).", { remarks: "Say why no work was done today." });
    } else if (num(totalQty ?? 0) <= 0) {
      throw validation("Add at least one activity with a quantity, or choose “No work today”.", { progress: "Add at least one activity with a quantity." });
    }
    if (!canTransitionDpr(updated.status, "SUBMITTED")) throw conflict("This report can't be submitted from its current state.");

    await tx.dpr.update({
      where: { id: dpr.id },
      data: { status: "SUBMITTED", submittedById: ctx.userId, submittedAt: ctx.now, rejectionReason: null, rejectedAt: null },
    });
    await writeAudit(tx, ctx, {
      action: "SUBMIT", entity: "Dpr", entityId: dpr.id, projectId,
      before: { status: dpr.status }, after: { status: "SUBMITTED", ...summarise(input) },
    });

    const pm = await tx.projectAssignment.findFirst({
      where: { projectId, user: { role: "PROJECT_MANAGER", isActive: true } },
      select: { user: { select: { name: true } } },
    });
    return { dprId: dpr.id, status: "SUBMITTED" as const, savedAt: ctx.now.toISOString(), pmName: pm?.user.name ?? null };
  });
}

export interface ApprovalSummary {
  activitiesUpdated: number;
  activitiesCompleted: number;
  mandaysPosted: number;
  ledgerEntries: number;
}

/**
 * PM approval. In one transaction: claim the report (SUBMITTED → APPROVED, so a double click can't double count),
 * add the quantities to each activity and move its status, roll labour mandays up to the activity, and issue the
 * materials from stock. If any stock is short, nothing at all is changed and the message says what is missing.
 */
export async function approveDpr(ctx: Ctx, dprId: string): Promise<ApprovalSummary> {
  const head = await db.dpr.findUnique({ where: { id: dprId }, select: { projectId: true } });
  if (!head) throw notFound("That report");
  assertCan(ctx, "approve", "dpr", head.projectId);

  return db.$transaction(async (tx) => {
    const claimed = await tx.dpr.updateMany({
      where: { id: dprId, status: "SUBMITTED" },
      data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: ctx.now },
    });
    if (claimed.count === 0) {
      const cur = await tx.dpr.findUnique({ where: { id: dprId }, include: { approvedBy: { select: { name: true } } } });
      if (cur?.status === "APPROVED") throw conflict(`This report was already approved${cur.approvedBy ? ` by ${cur.approvedBy.name}` : ""}. Nothing was changed again.`);
      throw conflict(`Only submitted reports can be approved. This one is ${DPR_STATUS_LABEL[cur?.status ?? "DRAFT"].toLowerCase()}.`);
    }

    const dpr = await tx.dpr.findUniqueOrThrow({ where: { id: dprId }, include: { progress: true, labour: true, materials: true } });

    // 1. Activity progress and status.
    const qtyByActivity = new Map<string, number>();
    for (const p of dpr.progress) qtyByActivity.set(p.activityId, (qtyByActivity.get(p.activityId) ?? 0) + num(p.quantity));
    const mandaysByActivity = new Map<string, number>();
    for (const l of dpr.labour) if (l.activityId) mandaysByActivity.set(l.activityId, (mandaysByActivity.get(l.activityId) ?? 0) + num(l.mandays));

    const touched = new Set([...qtyByActivity.keys(), ...mandaysByActivity.keys()]);
    const activities = await tx.activity.findMany({ where: { id: { in: [...touched] } } });
    let completed = 0;
    let updated = 0;
    for (const a of activities) {
      const qty = qtyByActivity.get(a.id) ?? 0;
      if (a.status === "HALTED" && qty > 0) {
        throw conflict(`${a.name} is halted, so progress on it can't be approved. Resume it in Planning first (or send the report back).`);
      }
      const newActual = num(a.actualQty) + qty;
      let status = a.status;
      const data: Prisma.ActivityUpdateInput = {
        actualQty: { increment: qty },
        actualMandays: { increment: mandaysByActivity.get(a.id) ?? 0 },
      };
      if (qty > 0) {
        if (a.status === "NOT_STARTED") {
          status = "IN_PROGRESS";
          data.actualStart = dpr.reportDate;
        }
        if (!a.actualStart && !data.actualStart) data.actualStart = dpr.reportDate;
        if (newActual >= num(a.plannedQty) && status !== "COMPLETED") {
          status = "COMPLETED";
          data.actualFinish = dpr.reportDate;
          completed += 1;
        }
      }
      data.status = status;
      await tx.activity.update({ where: { id: a.id }, data });
      if (qty > 0) updated += 1;
      if (status !== a.status) {
        await writeAudit(tx, ctx, {
          action: "STATUS_CHANGE", entity: "Activity", entityId: a.id, projectId: dpr.projectId, activityId: a.id,
          before: { status: a.status }, after: { status, cause: `DPR ${dpr.reportDate.toISOString().slice(0, 10)} approved` },
        });
      }
    }

    // 2. Material issues: check the whole report first so the message lists every shortage at once.
    const needs = new Map<string, number>();
    for (const m of dpr.materials) needs.set(m.materialId, (needs.get(m.materialId) ?? 0) + num(m.quantity));
    const shortages = await findShortages(tx, dpr.projectId, needs);
    if (shortages.length) throw conflict(shortageMessage(shortages));
    let ledgerEntries = 0;
    for (const m of dpr.materials) {
      ledgerEntries += await issueToActivity(tx, ctx, {
        projectId: dpr.projectId, materialId: m.materialId, quantity: num(m.quantity), activityId: m.activityId, dprId: dpr.id,
      });
    }

    const mandaysPosted = [...mandaysByActivity.values()].reduce((s, x) => s + x, 0);
    await writeAudit(tx, ctx, {
      action: "APPROVE", entity: "Dpr", entityId: dpr.id, projectId: dpr.projectId,
      before: { status: "SUBMITTED" },
      after: { status: "APPROVED", activitiesUpdated: updated, activitiesCompleted: completed, mandaysPosted: Number(mandaysPosted.toFixed(2)), ledgerEntries },
    });
    return { activitiesUpdated: updated, activitiesCompleted: completed, mandaysPosted: Number(mandaysPosted.toFixed(2)), ledgerEntries };
  });
}

/** PM sends a submitted report back with a reason. Nothing is posted. */
export async function rejectDpr(ctx: Ctx, dprId: string, reason: unknown) {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < 3) throw validation("Tell the engineer what to fix (at least a few words).", { reason: "Tell the engineer what to fix." });
  const head = await db.dpr.findUnique({ where: { id: dprId }, select: { projectId: true } });
  if (!head) throw notFound("That report");
  assertCan(ctx, "approve", "dpr", head.projectId);
  return db.$transaction(async (tx) => {
    const res = await tx.dpr.updateMany({
      where: { id: dprId, status: "SUBMITTED" },
      data: { status: "REJECTED", rejectionReason: why.slice(0, 500), rejectedAt: ctx.now },
    });
    if (res.count === 0) throw conflict("Only submitted reports can be sent back. This one has already been handled.");
    await writeAudit(tx, ctx, {
      action: "REJECT", entity: "Dpr", entityId: dprId, projectId: head.projectId,
      before: { status: "SUBMITTED" }, after: { status: "REJECTED", reason: why.slice(0, 500) },
    });
  });
}

// ── issues raised from the DPR (full issue handling arrives in milestone 6) ──

export async function addIssue(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "issue", projectId);
  const i = issueInput.parse(raw);
  return db.$transaction(async (tx) => {
    if (i.clientTxnId) {
      const dup = await tx.issue.findUnique({ where: { clientTxnId: i.clientTxnId } });
      if (dup) return dup.id; // idempotent replay
    }
    if (i.activityId) {
      const a = await tx.activity.findUnique({ where: { id: i.activityId }, select: { projectId: true } });
      if (!a || a.projectId !== projectId) throw validation("Pick an activity from this project.");
    }
    const dpr = await tx.dpr.findUnique({ where: { projectId_reportDate: { projectId, reportDate: istToday(ctx.now) } }, select: { id: true } });
    const code = await nextCode(tx, "ISS");
    const issue = await tx.issue.create({
      data: {
        code, projectId, activityId: i.activityId ?? null, dprId: dpr?.id ?? null, title: i.title, severity: i.severity,
        description: i.description || null, targetResolutionDate: i.targetResolutionDate ? new Date(`${i.targetResolutionDate}T00:00:00.000Z`) : null,
        reportedById: ctx.userId, clientTxnId: i.clientTxnId ?? null, ...demoFlag(),
      },
    });
    await writeAudit(tx, ctx, {
      action: "CREATE", entity: "Issue", entityId: issue.id, projectId, activityId: i.activityId ?? null,
      after: { code, title: i.title, severity: i.severity },
    });
    return issue.id;
  });
}
