import type { Prisma, RequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { dateKey } from "../dates";
import { conflict, forbidden, notFound, validation } from "../errors";
import { availableByMaterial } from "../inventory/stock";
import type { Ctx } from "../types";
import { materialRequestInput } from "./schemas";

type Tx = Prisma.TransactionClient;
const num = (d: { toString(): string }) => Number(d.toString());

export const MR_STATUS_LABEL: Record<RequestStatus, string> = {
  SUBMITTED: "Waiting for PM", CONVERTED: "Sent to purchase", REJECTED: "Not approved", CANCELLED: "Cancelled",
};

const midnight = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function createMaterialRequest(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "material_request", projectId);
  const input = materialRequestInput.parse(raw);
  return db.$transaction(async (tx) => {
    if (input.clientTxnId) {
      const dup = await tx.materialRequest.findUnique({ where: { clientTxnId: input.clientTxnId } });
      if (dup) return dup.id; // replayed from the offline outbox
    }
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true, name: true } });
    if (!project) throw notFound("That project");
    if (project.status !== "ACTIVE" && project.status !== "DELAYED") throw conflict(`${project.name} is not active, so material can't be requested for it.`);

    const ids = input.items.map((i) => i.materialId);
    if (new Set(ids).size !== ids.length) throw validation("A material is listed twice. Combine the quantities into one line.");
    const mats = await tx.material.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true } });
    if (mats.length !== ids.length) throw validation("One of the materials is not available. Pick from the list.");
    const actIds = input.items.flatMap((i) => (i.activityId ? [i.activityId] : []));
    if (actIds.length) {
      const acts = await tx.activity.findMany({ where: { id: { in: actIds }, projectId }, select: { id: true } });
      if (acts.length !== new Set(actIds).size) throw validation("Pick activities from this project.");
    }

    const code = await nextCode(tx, "MR");
    const mr = await tx.materialRequest.create({
      data: {
        code, projectId, requestedById: ctx.userId, neededBy: input.neededBy ? midnight(input.neededBy) : null, note: input.note || null,
        clientTxnId: input.clientTxnId ?? null, ...demoFlag(),
        items: { create: input.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, activityId: i.activityId ?? null })) },
      },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "MaterialRequest", entityId: mr.id, projectId, after: { code, lines: input.items.length } });
    return mr.id;
  });
}

const listInclude = {
  project: { select: { code: true, name: true } },
  requestedBy: { select: { name: true } },
  items: { include: { material: { select: { name: true, uom: { select: { code: true } } } } } },
  purchaseRequest: { select: { id: true, code: true } },
} satisfies Prisma.MaterialRequestInclude;

export async function listMaterialRequests(ctx: Ctx, f: { projectId?: string; status?: RequestStatus; mine?: boolean } = {}) {
  assertCan(ctx, "read", "material_request");
  const rows = await db.materialRequest.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ? f.projectId : { in: [...ctx.projectIds] } }),
      ...(f.status ? { status: f.status } : {}),
      ...(f.mine ? { requestedById: ctx.userId } : {}),
    },
    include: listInclude,
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const allowed = new Set(ctx.projectIds);
  return rows.filter((r) => ctx.allProjects || allowed.has(r.projectId)).map((r) => ({
    id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, status: r.status,
    requestedBy: r.requestedBy.name, neededBy: r.neededBy ? dateKey(r.neededBy) : null, note: r.note, rejectionReason: r.rejectionReason,
    createdAt: r.createdAt.toISOString(), purchaseRequest: r.purchaseRequest,
    items: r.items.map((i) => ({ id: i.id, material: i.material.name, unit: i.material.uom.code, quantity: num(i.quantity) })),
  }));
}
export type MaterialRequestRow = Awaited<ReturnType<typeof listMaterialRequests>>[number];

export async function getMaterialRequest(ctx: Ctx, id: string) {
  const r = await db.materialRequest.findUnique({
    where: { id },
    include: { ...listInclude, items: { include: { material: { select: { id: true, name: true, uom: { select: { code: true } } } }, activity: { select: { code: true, name: true } } } }, decidedBy: { select: { name: true } } },
  });
  if (!r) throw notFound("That request");
  assertCan(ctx, "read", "material_request", r.projectId);
  const stock = await availableByMaterial(r.projectId);
  return {
    id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, status: r.status,
    requestedBy: r.requestedBy.name, requestedById: r.requestedById, neededBy: r.neededBy ? dateKey(r.neededBy) : null, note: r.note,
    rejectionReason: r.rejectionReason, decidedBy: r.decidedBy?.name ?? null, createdAt: r.createdAt.toISOString(), purchaseRequest: r.purchaseRequest,
    items: r.items.map((i) => ({
      id: i.id, materialId: i.material.id, material: i.material.name, unit: i.material.uom.code, quantity: num(i.quantity),
      activity: i.activity ? `${i.activity.code} ${i.activity.name}` : null, inStock: stock.get(i.material.id) ?? 0,
    })),
    canDecide: can(ctx, "update", "material_request", r.projectId),
    canCancel: r.status === "SUBMITTED" && r.requestedById === ctx.userId,
  };
}

/** PM turns a request into a purchase request. The request is claimed first, so it can't be converted twice. */
export async function convertToPurchaseRequest(ctx: Ctx, mrId: string, raw: { note?: string | null } = {}) {
  const head = await db.materialRequest.findUnique({ where: { id: mrId }, select: { projectId: true } });
  if (!head) throw notFound("That request");
  assertCan(ctx, "update", "material_request", head.projectId);
  assertCan(ctx, "create", "purchase_request", head.projectId);
  return db.$transaction(async (tx) => {
    const claimed = await tx.materialRequest.updateMany({
      where: { id: mrId, status: "SUBMITTED" },
      data: { status: "CONVERTED", decidedById: ctx.userId, decidedAt: ctx.now },
    });
    if (claimed.count === 0) throw conflict("This request has already been handled. Refresh to see its current state.");
    const mr = await tx.materialRequest.findUniqueOrThrow({ where: { id: mrId }, include: { items: true } });
    const code = await nextCode(tx, "PR");
    const pr = await tx.purchaseRequest.create({
      data: {
        code, projectId: mr.projectId, materialRequestId: mr.id, raisedById: ctx.userId, neededBy: mr.neededBy,
        note: (raw.note ?? mr.note ?? "").toString().trim().slice(0, 500) || null, ...demoFlag(),
        items: { create: mr.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity })) },
      },
    });
    await writeAudit(tx, ctx, {
      action: "CONVERT", entity: "MaterialRequest", entityId: mrId, projectId: mr.projectId,
      before: { status: "SUBMITTED" }, after: { status: "CONVERTED", purchaseRequest: code },
    });
    return pr.id;
  });
}

export async function rejectMaterialRequest(ctx: Ctx, mrId: string, reason: unknown) {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < 3) throw validation("Tell the engineer why (a few words).", { reason: "Tell the engineer why." });
  const head = await db.materialRequest.findUnique({ where: { id: mrId }, select: { projectId: true } });
  if (!head) throw notFound("That request");
  assertCan(ctx, "update", "material_request", head.projectId);
  await db.$transaction(async (tx) => {
    const res = await tx.materialRequest.updateMany({ where: { id: mrId, status: "SUBMITTED" }, data: { status: "REJECTED", decidedById: ctx.userId, decidedAt: ctx.now, rejectionReason: why.slice(0, 300) } });
    if (res.count === 0) throw conflict("This request has already been handled.");
    await writeAudit(tx, ctx, { action: "REJECT", entity: "MaterialRequest", entityId: mrId, projectId: head.projectId, after: { reason: why.slice(0, 300) } });
  });
}

export async function cancelMaterialRequest(ctx: Ctx, mrId: string) {
  const mr = await db.materialRequest.findUnique({ where: { id: mrId } });
  if (!mr) throw notFound("That request");
  assertCan(ctx, "create", "material_request", mr.projectId);
  if (mr.requestedById !== ctx.userId && !can(ctx, "update", "material_request", mr.projectId)) throw forbidden("You can only cancel your own requests.");
  await db.$transaction(async (tx: Tx) => {
    const res = await tx.materialRequest.updateMany({ where: { id: mrId, status: "SUBMITTED" }, data: { status: "CANCELLED", decidedById: ctx.userId, decidedAt: ctx.now } });
    if (res.count === 0) throw conflict("This request was already handled, so it can't be cancelled.");
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "MaterialRequest", entityId: mrId, projectId: mr.projectId });
  });
}
