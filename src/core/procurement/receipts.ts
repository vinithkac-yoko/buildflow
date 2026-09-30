import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { dateKey, istToday } from "../dates";
import { conflict, notFound, validation } from "../errors";
import { postLedger } from "../inventory/stock";
import type { Ctx } from "../types";
import { receiptInput } from "./schemas";

const num = (d: { toString(): string } | number) => Number(d.toString());
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * Store Keeper records a delivery against a PO (full or partial). In one transaction: each line's received total
 * is bumped (never beyond what was ordered), stock is posted as PO_RECEIPT at the PO rate, and the PO's status moves.
 */
export async function recordReceipt(ctx: Ctx, orderId: string, raw: unknown) {
  const input = receiptInput.parse(raw);
  const head = await db.purchaseOrder.findUnique({ where: { id: orderId }, select: { projectId: true } });
  if (!head) throw notFound("That purchase order");
  assertCan(ctx, "create", "receipt", head.projectId);

  return db.$transaction(async (tx) => {
    if (input.clientTxnId) {
      const dup = await tx.materialReceipt.findUnique({ where: { clientTxnId: input.clientTxnId } });
      if (dup) return dup.id;
    }
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${orderId} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { material: { select: { name: true, uom: { select: { code: true } } } } } } } });
    if (po.status === "CANCELLED") throw conflict("This order was cancelled, so nothing can be received against it.");
    if (po.status === "RECEIVED") throw conflict("This order is already fully received.");

    const loc = await tx.storageLocation.findUnique({ where: { id: input.storageLocationId } });
    if (!loc || loc.projectId !== po.projectId) throw validation("Pick a storage location that belongs to this project.", { storageLocationId: "Pick a location from this project." });

    const byId = new Map(po.items.map((i) => [i.id, i]));
    const seen = new Set<string>();
    const errors: Record<string, string> = {};
    input.items.forEach((l, idx) => {
      const it = byId.get(l.poItemId);
      if (!it) errors[`items.${idx}.quantity`] = "That line isn't on this order.";
      else if (seen.has(l.poItemId)) errors[`items.${idx}.quantity`] = "This material is listed twice.";
      else {
        const remaining = num(it.quantity) - num(it.receivedQty);
        if (l.quantity > remaining + 1e-9) {
          errors[`items.${idx}.quantity`] = `Only ${fmt(remaining)} ${it.material.uom.code} of ${it.material.name} still due (ordered ${fmt(num(it.quantity))}, received ${fmt(num(it.receivedQty))}). Enter ${fmt(remaining)} or less.`;
        }
      }
      seen.add(l.poItemId);
    });
    if (Object.keys(errors).length) {
      const first = Object.values(errors)[0];
      throw validation(first, errors);
    }

    const code = await nextCode(tx, "GRN");
    const receivedOn = input.receivedOn ? new Date(`${input.receivedOn}T00:00:00.000Z`) : istToday(ctx.now);
    const receipt = await tx.materialReceipt.create({
      data: {
        code, orderId, projectId: po.projectId, storageLocationId: loc.id, receivedOn, challanNo: input.challanNo || null, note: input.note || null,
        receivedById: ctx.userId, clientTxnId: input.clientTxnId ?? null, ...demoFlag(),
        items: { create: input.items.map((l) => ({ poItemId: l.poItemId, materialId: byId.get(l.poItemId)!.materialId, quantity: l.quantity })) },
      },
    });
    for (const l of input.items) {
      const it = byId.get(l.poItemId)!;
      await tx.purchaseOrderItem.update({ where: { id: it.id }, data: { receivedQty: { increment: l.quantity } } }); // CHECK guards over-receipt
      await postLedger(tx, ctx, {
        projectId: po.projectId, storageLocationId: loc.id, materialId: it.materialId, type: "PO_RECEIPT", quantity: l.quantity,
        unitCost: num(it.unitRate), refType: "PurchaseOrder", refId: po.id, note: `${po.code} · ${code}${input.challanNo ? ` · challan ${input.challanNo}` : ""}`,
      });
    }
    const after = await tx.purchaseOrderItem.findMany({ where: { orderId } });
    const complete = after.every((i) => num(i.receivedQty) >= num(i.quantity) - 1e-9);
    await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
    await writeAudit(tx, ctx, {
      action: "CREATE", entity: "MaterialReceipt", entityId: receipt.id, projectId: po.projectId,
      after: { code, order: po.code, lines: input.items.length, status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED", on: dateKey(receivedOn) },
    });
    return receipt.id;
  });
}

export async function listReceipts(ctx: Ctx, f: { projectId?: string } = {}) {
  assertCan(ctx, "read", "receipt");
  const rows = await db.materialReceipt.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ? f.projectId : { in: [...ctx.projectIds] } }),
    },
    include: {
      order: { select: { id: true, code: true, vendor: { select: { name: true } } } },
      project: { select: { code: true, name: true } }, storageLocation: { select: { name: true } }, receivedBy: { select: { name: true } },
      items: { include: { material: { select: { name: true, uom: { select: { code: true } } } } } },
    },
    orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
    take: 60,
  });
  const allowed = new Set(ctx.projectIds);
  return rows.filter((r) => ctx.allProjects || allowed.has(r.projectId)).map((r) => ({
    id: r.id, code: r.code, orderId: r.order.id, orderCode: r.order.code, vendor: r.order.vendor.name, projectId: r.projectId, projectCode: r.project.code,
    projectName: r.project.name, location: r.storageLocation.name, receivedOn: dateKey(r.receivedOn), challanNo: r.challanNo, receivedBy: r.receivedBy.name,
    items: r.items.map((i) => ({ material: i.material.name, unit: i.material.uom.code, quantity: num(i.quantity) })),
  }));
}
export type ReceiptRow = Awaited<ReturnType<typeof listReceipts>>[number];
