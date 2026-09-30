import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { dateKey, istToday } from "../dates";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";
import { inspectionResult } from "./calc";
import { inspectionInput, inspectionRequestInput } from "./schemas";

type Tx = Prisma.TransactionClient;

/** A Site Engineer (or anyone allowed to raise one) asks for an inspection of an activity. The Quality Engineer completes it. */
export async function requestInspection(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "inspection", projectId);
  const input = inspectionRequestInput.parse(raw);
  return db.$transaction(async (tx) => {
    if (input.clientTxnId) {
      const dup = await tx.qualityInspection.findUnique({ where: { clientTxnId: input.clientTxnId } });
      if (dup) return dup.id;
    }
    const [project, act, list] = await Promise.all([
      tx.project.findUnique({ where: { id: projectId }, select: { status: true, name: true } }),
      tx.activity.findUnique({ where: { id: input.activityId }, select: { projectId: true, name: true } }),
      tx.qualityChecklist.findUnique({ where: { id: input.checklistId }, select: { status: true, name: true } }),
    ]);
    if (!project) throw notFound("That project");
    if (project.status !== "ACTIVE" && project.status !== "DELAYED") throw conflict(`${project.name} is not active, so inspections can't be raised for it.`);
    if (!act || act.projectId !== projectId) throw validation("Pick an activity from this project.", { activityId: "Pick an activity from this project." });
    if (!list || list.status !== "ACTIVE") throw validation("Pick an active checklist.", { checklistId: "Pick an active checklist." });
    const code = await nextCode(tx, "INS");
    const row = await tx.qualityInspection.create({
      data: {
        code, projectId, activityId: input.activityId, checklistId: input.checklistId, status: "REQUESTED", requestedById: ctx.userId,
        requestNote: input.note || null, clientTxnId: input.clientTxnId ?? null, ...demoFlag(),
      },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "QualityInspection", entityId: row.id, projectId, activityId: input.activityId, after: { code, status: "REQUESTED", checklist: list.name } });
    return row.id;
  });
}

/** The subcontractor who most recently logged labour on the activity (used to link an NCR when the inspector doesn't pick one). */
async function likelySubcontractor(tx: Tx, activityId: string) {
  const log = await tx.labourLog.findFirst({ where: { activityId, subcontractorId: { not: null } }, orderBy: { createdAt: "desc" }, select: { subcontractorId: true } });
  return log?.subcontractorId ?? null;
}

/**
 * The Quality Engineer completes an inspection against a checklist. Every checkpoint must be answered; the result is
 * computed from the counts. A rejection raises an NCR in the same transaction (linked to the subcontractor, if any).
 */
export async function completeInspection(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "update", "inspection", projectId);
  const input = inspectionInput.parse(raw);
  return db.$transaction(async (tx) => {
    if (input.clientTxnId) {
      const dup = await tx.qualityInspection.findUnique({ where: { clientTxnId: input.clientTxnId }, include: { raisedNcr: { select: { id: true } } } });
      if (dup) return { inspectionId: dup.id, result: dup.result!, ncrId: dup.raisedNcr?.id ?? null };
    }
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true, name: true } });
    if (!project) throw notFound("That project");
    if (project.status !== "ACTIVE" && project.status !== "DELAYED") throw conflict(`${project.name} is not active, so it can't be inspected.`);
    const act = await tx.activity.findUnique({ where: { id: input.activityId }, select: { projectId: true, name: true } });
    if (!act || act.projectId !== projectId) throw validation("Pick an activity from this project.", { activityId: "Pick an activity from this project." });
    const list = await tx.qualityChecklist.findUnique({ where: { id: input.checklistId }, include: { items: { orderBy: { seq: "asc" } } } });
    if (!list || list.status !== "ACTIVE") throw validation("Pick an active checklist.", { checklistId: "Pick an active checklist." });

    // Every checkpoint of the checklist is answered exactly once.
    const answered = new Map<number, (typeof input.results)[number]>();
    for (const r of input.results) {
      if (answered.has(r.seq)) throw validation(`Checkpoint ${r.seq} is answered twice.`);
      answered.set(r.seq, r);
    }
    const missing = list.items.filter((i) => !answered.has(i.seq));
    if (missing.length) throw validation(`Answer every checkpoint — ${missing.length} still to do (first: “${missing[0].text}”).`);
    if (answered.size !== list.items.length) throw validation("Some answers don't belong to this checklist. Reload and try again.");

    const total = list.items.length;
    const passed = list.items.filter((i) => answered.get(i.seq)!.passed).length;
    const result = inspectionResult(total, passed);
    const date = input.inspectionDate ? new Date(`${input.inspectionDate}T00:00:00.000Z`) : istToday(ctx.now);

    let subcontractorId = input.subcontractorId ?? null;
    if (subcontractorId && !(await tx.subcontractor.findUnique({ where: { id: subcontractorId }, select: { id: true } }))) {
      throw validation("Pick a subcontractor from the list.", { subcontractorId: "Pick a subcontractor from the list." });
    }
    if (result === "REJECTED_NCR" && !subcontractorId) subcontractorId = await likelySubcontractor(tx, input.activityId);

    const data = {
      status: "COMPLETED" as const, inspectionDate: date, inspectorId: ctx.userId, totalCheckpoints: total, passedCheckpoints: passed, result,
      remarks: input.remarks || null, subcontractorId, completedAt: ctx.now,
    };
    let inspectionId: string;
    if (input.requestId) {
      const claimed = await tx.qualityInspection.updateMany({
        where: { id: input.requestId, projectId, status: "REQUESTED", activityId: input.activityId, checklistId: input.checklistId },
        data,
      });
      if (claimed.count === 0) throw conflict("This inspection request was already completed, or doesn't match the activity and checklist.");
      inspectionId = input.requestId;
      if (input.clientTxnId) await tx.qualityInspection.update({ where: { id: inspectionId }, data: { clientTxnId: input.clientTxnId } });
    } else {
      const code = await nextCode(tx, "INS");
      const row = await tx.qualityInspection.create({
        data: { ...data, code, projectId, activityId: input.activityId, checklistId: input.checklistId, clientTxnId: input.clientTxnId ?? null, ...demoFlag() },
      });
      inspectionId = row.id;
    }
    await tx.inspectionResult.createMany({
      data: list.items.map((i) => ({ inspectionId, seq: i.seq, text: i.text, passed: answered.get(i.seq)!.passed, note: answered.get(i.seq)!.note || null })),
    });

    let ncrId: string | null = null;
    if (result === "REJECTED_NCR") {
      const failed = list.items.filter((i) => !answered.get(i.seq)!.passed);
      const defect = (input.defect?.trim() || `Failed ${failed.length} of ${total} checkpoints on ${list.name}: ${failed.map((f) => f.text).join("; ")}`).slice(0, 500);
      const code = await nextCode(tx, "NCR");
      const ncr = await tx.ncr.create({
        data: {
          code, projectId, activityId: input.activityId, inspectionId, subcontractorId, severity: input.severity ?? "MAJOR", defect, raisedById: ctx.userId, ...demoFlag(),
          actions: { create: [{ step: "RAISED", note: `From inspection — ${passed} of ${total} checkpoints passed`, userId: ctx.userId, createdAt: ctx.now }] },
        },
      });
      ncrId = ncr.id;
      await writeAudit(tx, ctx, { action: "CREATE", entity: "Ncr", entityId: ncr.id, projectId, activityId: input.activityId, after: { code, severity: input.severity ?? "MAJOR", subcontractorId } });
    }
    await writeAudit(tx, ctx, {
      action: "COMPLETE", entity: "QualityInspection", entityId: inspectionId, projectId, activityId: input.activityId,
      after: { checklist: list.name, total, passed, result, ncrId },
    });
    return { inspectionId, result, ncrId };
  });
}

const listInclude = {
  project: { select: { code: true, name: true } },
  activity: { select: { code: true, name: true } },
  checklist: { select: { name: true } },
  inspector: { select: { name: true } },
  requestedBy: { select: { name: true } },
  subcontractor: { select: { name: true } },
  raisedNcr: { select: { id: true, code: true, status: true, severity: true } },
} satisfies Prisma.QualityInspectionInclude;

function scope(ctx: Ctx, projectId?: string): Prisma.QualityInspectionWhereInput {
  return { ...(projectId ? { projectId } : {}), ...(ctx.allProjects ? {} : { projectId: projectId ?? { in: [...ctx.projectIds] } }) };
}

export async function listInspections(ctx: Ctx, f: { projectId?: string; status?: "REQUESTED" | "COMPLETED"; mine?: boolean } = {}) {
  assertCan(ctx, "read", "inspection");
  if (f.projectId && !ctx.allProjects && !ctx.projectIds.includes(f.projectId)) return [];
  const rows = await db.qualityInspection.findMany({
    where: { ...scope(ctx, f.projectId), ...(f.status ? { status: f.status } : {}), ...(f.mine ? { requestedById: ctx.userId } : {}) },
    include: listInclude,
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, activityId: r.activityId,
    activity: `${r.activity.code} ${r.activity.name}`, checklistId: r.checklistId, checklist: r.checklist.name, status: r.status,
    date: r.inspectionDate ? dateKey(r.inspectionDate) : null, inspector: r.inspector?.name ?? null, requestedBy: r.requestedBy?.name ?? null, requestNote: r.requestNote,
    total: r.totalCheckpoints, passed: r.passedCheckpoints, result: r.result, subcontractor: r.subcontractor?.name ?? null, ncr: r.raisedNcr, createdAt: r.createdAt.toISOString(),
  }));
}
export type InspectionRow = Awaited<ReturnType<typeof listInspections>>[number];

export async function getInspection(ctx: Ctx, id: string) {
  const r = await db.qualityInspection.findUnique({ where: { id }, include: { ...listInclude, results: { orderBy: { seq: "asc" } } } });
  if (!r) throw notFound("That inspection");
  assertCan(ctx, "read", "inspection", r.projectId);
  return {
    id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, activityId: r.activityId,
    activity: `${r.activity.code} ${r.activity.name}`, checklist: r.checklist.name, status: r.status, date: r.inspectionDate ? dateKey(r.inspectionDate) : null,
    inspector: r.inspector?.name ?? null, requestedBy: r.requestedBy?.name ?? null, requestNote: r.requestNote, total: r.totalCheckpoints, passed: r.passedCheckpoints,
    result: r.result, remarks: r.remarks, subcontractor: r.subcontractor?.name ?? null, ncr: r.raisedNcr,
    results: r.results.map((x) => ({ seq: x.seq, text: x.text, passed: x.passed, note: x.note })),
    canComplete: r.status === "REQUESTED" && can(ctx, "update", "inspection", r.projectId),
  };
}
export type InspectionDetail = Awaited<ReturnType<typeof getInspection>>;

/** Everything the inspection screens need to start one: assigned active projects with activities, checklists with their checkpoints, subcontractors. */
export async function inspectionFormData(ctx: Ctx) {
  assertCan(ctx, "create", "inspection");
  const [projects, checklists, subs] = await Promise.all([
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "DELAYED"] }, ...(ctx.allProjects ? {} : { id: { in: [...ctx.projectIds] } }) },
      select: { id: true, code: true, name: true, activities: { select: { id: true, code: true, name: true, status: true }, orderBy: { code: "asc" } } },
      orderBy: { code: "asc" },
    }),
    db.qualityChecklist.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, items: { select: { seq: true, text: true }, orderBy: { seq: "asc" } } }, orderBy: { name: "asc" } }),
    db.subcontractor.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    projects: projects.map((p) => ({ id: p.id, code: p.code, name: p.name, activities: p.activities.map((a) => ({ id: a.id, name: `${a.code} ${a.name}` })) })),
    checklists, subcontractors: subs,
  };
}
export type InspectionFormData = Awaited<ReturnType<typeof inspectionFormData>>;
