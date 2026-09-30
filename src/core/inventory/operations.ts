import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan } from "../auth/permissions";
import { notFound, validation } from "../errors";
import type { Ctx } from "../types";
import { stockAdjustInput, stockIssueInput, stockReturnInput, stockTransferInput } from "../procurement/schemas";
import { issueToActivity, postLedger } from "./stock";

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

async function materialOrThrow(tx: Pick<typeof db, "material">, id: string) {
  const m = await tx.material.findUnique({ where: { id }, select: { id: true, name: true, uom: { select: { code: true } } } });
  if (!m) throw validation("Pick a material from the list.", { materialId: "Pick a material from the list." });
  return m;
}

/** Store Keeper issues material to an activity. Takes from the chosen location, else Main Store first. */
export async function issueStock(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "inventory", projectId);
  const input = stockIssueInput.parse(raw);
  return db.$transaction(async (tx) => {
    const act = await tx.activity.findUnique({ where: { id: input.activityId }, select: { projectId: true, name: true } });
    if (!act || act.projectId !== projectId) throw validation("Pick an activity from this project.", { activityId: "Pick an activity from this project." });
    const mat = await materialOrThrow(tx, input.materialId);
    let entries: number;
    if (input.storageLocationId) {
      const loc = await tx.storageLocation.findUnique({ where: { id: input.storageLocationId } });
      if (!loc || loc.projectId !== projectId) throw validation("Pick a location from this project.", { storageLocationId: "Pick a location from this project." });
      await postLedger(tx, ctx, {
        projectId, storageLocationId: loc.id, materialId: mat.id, type: "ACTIVITY_ISSUE", quantity: input.quantity, activityId: input.activityId,
        note: input.note, clientTxnId: input.clientTxnId,
      });
      entries = 1;
    } else {
      const total = await tx.stockBalance.aggregate({ where: { projectId, materialId: mat.id }, _sum: { quantity: true } });
      const have = Number(total._sum.quantity ?? 0);
      if (input.quantity > have + 1e-9) {
        throw validation(`Only ${fmt(have)} ${mat.uom.code} of ${mat.name} in stock. Issue ${fmt(have)} or less, or record a receipt first.`, { quantity: `Only ${fmt(have)} ${mat.uom.code} of ${mat.name} in stock. Enter ${fmt(have)} or less.` });
      }
      entries = await issueToActivity(tx, ctx, { projectId, materialId: mat.id, quantity: input.quantity, activityId: input.activityId });
    }
    await writeAudit(tx, ctx, {
      action: "CREATE", entity: "StockIssue", entityId: `${projectId}:${mat.id}`, projectId, activityId: input.activityId,
      after: { material: mat.name, quantity: input.quantity, activity: act.name, entries },
    });
    return { entries };
  });
}

/** Unused material comes back from an activity into a location. Valued at the current average cost there. */
export async function returnStock(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "inventory", projectId);
  const input = stockReturnInput.parse(raw);
  return db.$transaction(async (tx) => {
    const loc = await tx.storageLocation.findUnique({ where: { id: input.storageLocationId } });
    if (!loc || loc.projectId !== projectId) throw validation("Pick a location from this project.", { storageLocationId: "Pick a location from this project." });
    if (input.activityId) {
      const act = await tx.activity.findUnique({ where: { id: input.activityId }, select: { projectId: true } });
      if (!act || act.projectId !== projectId) throw validation("Pick an activity from this project.", { activityId: "Pick an activity from this project." });
    }
    const mat = await materialOrThrow(tx, input.materialId);
    const anyBal = await tx.stockBalance.findMany({ where: { projectId, materialId: mat.id }, select: { avgCost: true, quantity: true } });
    const qty = anyBal.reduce((s, b) => s + Number(b.quantity), 0);
    const unitCost = qty > 0 ? anyBal.reduce((s, b) => s + Number(b.quantity) * Number(b.avgCost), 0) / qty : anyBal[0] ? Number(anyBal[0].avgCost) : 0;
    await postLedger(tx, ctx, {
      projectId, storageLocationId: loc.id, materialId: mat.id, type: "ACTIVITY_RETURN", quantity: input.quantity, unitCost,
      activityId: input.activityId ?? null, note: input.note,
    });
    await writeAudit(tx, ctx, {
      action: "CREATE", entity: "StockReturn", entityId: `${projectId}:${mat.id}`, projectId, activityId: input.activityId ?? null,
      after: { material: mat.name, quantity: input.quantity, location: loc.name },
    });
  });
}

/** Move stock between locations or projects: a TRANSFER_OUT and a TRANSFER_IN, both or neither. */
export async function transferStock(ctx: Ctx, fromProjectId: string, raw: unknown) {
  assertCan(ctx, "create", "inventory", fromProjectId);
  const input = stockTransferInput.parse(raw);
  assertCan(ctx, "create", "inventory", input.toProjectId);
  return db.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.storageLocation.findUnique({ where: { id: input.fromLocationId } }),
      tx.storageLocation.findUnique({ where: { id: input.toLocationId } }),
    ]);
    if (!from || from.projectId !== fromProjectId) throw validation("Pick a source location from this project.", { fromLocationId: "Pick a location from this project." });
    if (!to || to.projectId !== input.toProjectId) throw validation("Pick a destination location from that project.", { toLocationId: "Pick a location from the destination project." });
    if (from.id === to.id) throw validation("Source and destination are the same place.", { toLocationId: "Pick a different place." });
    const mat = await materialOrThrow(tx, input.materialId);
    const out = await postLedger(tx, ctx, {
      projectId: fromProjectId, storageLocationId: from.id, materialId: mat.id, type: "TRANSFER_OUT", quantity: input.quantity,
      refType: "Transfer", note: input.note ?? `To ${to.name}`,
    });
    await postLedger(tx, ctx, {
      projectId: input.toProjectId, storageLocationId: to.id, materialId: mat.id, type: "TRANSFER_IN", quantity: input.quantity,
      unitCost: Number(out.unitCost), refType: "Transfer", refId: out.id, note: input.note ?? `From ${from.name}`,
    });
    await writeAudit(tx, ctx, {
      action: "CREATE", entity: "StockTransfer", entityId: out.id, projectId: fromProjectId,
      after: { material: mat.name, quantity: input.quantity, from: from.name, to: to.name, toProjectId: input.toProjectId },
    });
  });
}

/** Count corrections. WASTAGE and THEFT_LOSS remove stock; GAIN adds it (posted as a count adjustment at current cost). */
export async function adjustStock(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "inventory", projectId);
  const input = stockAdjustInput.parse(raw);
  return db.$transaction(async (tx) => {
    const loc = await tx.storageLocation.findUnique({ where: { id: input.storageLocationId } });
    if (!loc || loc.projectId !== projectId) throw validation("Pick a location from this project.", { storageLocationId: "Pick a location from this project." });
    const mat = await materialOrThrow(tx, input.materialId);
    if (input.kind === "GAIN") {
      const bal = await tx.stockBalance.findUnique({ where: { projectId_storageLocationId_materialId: { projectId, storageLocationId: loc.id, materialId: mat.id } } });
      const other = bal ?? (await tx.stockBalance.findFirst({ where: { projectId, materialId: mat.id } }));
      await postLedger(tx, ctx, {
        projectId, storageLocationId: loc.id, materialId: mat.id, type: "OPENING_STOCK", quantity: input.quantity,
        unitCost: other ? Number(other.avgCost) : 0, note: `Count adjustment (gain): ${input.note}`,
      });
    } else {
      await postLedger(tx, ctx, { projectId, storageLocationId: loc.id, materialId: mat.id, type: input.kind, quantity: input.quantity, note: input.note });
    }
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: "StockAdjustment", entityId: `${projectId}:${mat.id}`, projectId,
      after: { material: mat.name, kind: input.kind, quantity: input.quantity, location: loc.name, note: input.note },
    });
  });
}

/** Locations of a project for pickers (with what is held, so the screen can show it). */
export async function locationsForProject(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "inventory", projectId);
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!p) throw notFound("That project");
  return db.storageLocation.findMany({ where: { projectId }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } });
}
