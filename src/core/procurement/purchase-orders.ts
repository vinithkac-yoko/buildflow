import type { PoStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can, canSeeField, redact } from "../auth/permissions";
import { dateKey } from "../dates";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";
import { lineAmounts } from "./orders";

const num = (d: { toString(): string } | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d.toString()));
const money = (n: number) => Math.round(n * 100) / 100;

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  ISSUED: "Issued — awaiting delivery", PARTIALLY_RECEIVED: "Partly received", RECEIVED: "Fully received", CANCELLED: "Cancelled",
};

export async function listPurchaseOrders(ctx: Ctx, f: { projectId?: string; status?: PoStatus | "OPEN"; vendorId?: string } = {}) {
  assertCan(ctx, "read", "purchase_order");
  const rows = await db.purchaseOrder.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ? f.projectId : { in: [...ctx.projectIds] } }),
      ...(f.status === "OPEN" ? { status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] as PoStatus[] } } : f.status ? { status: f.status } : {}),
    },
    include: {
      project: { select: { code: true, name: true } }, vendor: { select: { name: true } },
      items: { select: { quantity: true, receivedQty: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const allowed = new Set(ctx.projectIds);
  return rows.filter((r) => ctx.allProjects || allowed.has(r.projectId)).map((r) => {
    const ordered = r.items.reduce((s, i) => s + num(i.quantity), 0);
    const got = r.items.reduce((s, i) => s + num(i.receivedQty), 0);
    return redact(ctx, {
      id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, vendor: r.vendor.name, status: r.status,
      orderDate: dateKey(r.orderDate), expectedDate: r.expectedDate ? dateKey(r.expectedDate) : null, lines: r.items.length,
      receivedPct: ordered > 0 ? Math.round((got / ordered) * 100) : 0, poTotal: num(r.poTotal),
    }, r.projectId);
  });
}
export type PurchaseOrderRow = Awaited<ReturnType<typeof listPurchaseOrders>>[number];

export async function getPurchaseOrder(ctx: Ctx, id: string) {
  const o = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } }, vendor: { select: { id: true, name: true, contact: true } },
      purchaseRequest: { select: { id: true, code: true } }, raisedBy: { select: { name: true } },
      items: { include: { material: { select: { id: true, name: true, uom: { select: { code: true } } } } }, orderBy: { material: { name: "asc" } } },
      receipts: { include: { storageLocation: { select: { name: true } }, receivedBy: { select: { name: true } }, items: { include: { material: { select: { name: true, uom: { select: { code: true } } } } } } }, orderBy: { receivedOn: "asc" } },
      invoices: { include: { payments: { orderBy: { paidOn: "asc" } } }, orderBy: { invoiceDate: "asc" } },
    },
  });
  if (!o) throw notFound("That purchase order");
  assertCan(ctx, "read", "purchase_order", o.projectId);

  const lines = o.items.map((i) => {
    const a = lineAmounts(num(i.quantity), num(i.unitRate), num(i.taxPct));
    return {
      id: i.id, materialId: i.material.id, material: i.material.name, unit: i.material.uom.code, quantity: num(i.quantity), receivedQty: num(i.receivedQty),
      remaining: money(num(i.quantity) - num(i.receivedQty)), unitRate: num(i.unitRate), taxPct: num(i.taxPct), lineTotal: a.total,
    };
  });
  const receivedValue = money(o.items.reduce((s, i) => s + lineAmounts(num(i.receivedQty), num(i.unitRate), num(i.taxPct)).total, 0));
  const invoiced = money(o.invoices.reduce((s, v) => s + num(v.invoiceTotal), 0));
  const paid = money(o.invoices.reduce((s, v) => s + num(v.paidAmount), 0));

  const view = {
    id: o.id, code: o.code, projectId: o.projectId, projectCode: o.project.code, projectName: o.project.name, vendor: o.vendor,
    status: o.status, orderDate: dateKey(o.orderDate), expectedDate: o.expectedDate ? dateKey(o.expectedDate) : null, terms: o.terms,
    raisedBy: o.raisedBy.name, purchaseRequest: o.purchaseRequest, cancelReason: o.cancelReason,
    poSubtotal: num(o.poSubtotal), poTax: num(o.poTax), poTotal: num(o.poTotal),
    lines,
    receipts: o.receipts.map((r) => ({
      id: r.id, code: r.code, receivedOn: dateKey(r.receivedOn), challanNo: r.challanNo, location: r.storageLocation.name, receivedBy: r.receivedBy.name, note: r.note,
      items: r.items.map((i) => ({ id: i.id, material: i.material.name, unit: i.material.uom.code, quantity: num(i.quantity) })),
    })),
    invoices: (can(ctx, "read", "invoice", o.projectId) ? o.invoices : []).map((v) => ({
      id: v.id, code: v.code, projectId: o.projectId, invoiceNo: v.invoiceNo, invoiceDate: dateKey(v.invoiceDate), dueDate: v.dueDate ? dateKey(v.dueDate) : null,
      status: v.status, invoiceSubtotal: num(v.invoiceSubtotal), invoiceTax: num(v.invoiceTax), invoiceTotal: num(v.invoiceTotal), paidAmount: num(v.paidAmount),
      outstanding: money(num(v.invoiceTotal) - num(v.paidAmount)),
      payments: v.payments.map((p) => ({ id: p.id, code: p.code, paidOn: dateKey(p.paidOn), mode: p.mode, reference: p.reference, paymentAmount: num(p.paymentAmount) })),
    })),
    summary: !canSeeField(ctx, "payable", o.projectId) ? undefined : { receivedValue, invoiced, paid, outstanding: money(invoiced - paid), yetToInvoice: money(num(o.poTotal) - invoiced) },
    canReceive: o.status !== "CANCELLED" && o.status !== "RECEIVED" && can(ctx, "create", "receipt", o.projectId),
    canInvoice: o.status !== "CANCELLED" && can(ctx, "create", "invoice", o.projectId),
    canPay: can(ctx, "create", "payment", o.projectId),
    canCancel: o.status === "ISSUED" && o.receipts.length === 0 && o.invoices.length === 0 && can(ctx, "update", "purchase_order", o.projectId),
  };
  return redact(ctx, view, o.projectId);
}
export type PurchaseOrderDetail = Awaited<ReturnType<typeof getPurchaseOrder>>;

/** Cancel an order nothing has been received or invoiced against; the request reopens for a new choice. */
export async function cancelPurchaseOrder(ctx: Ctx, poId: string, reason: unknown) {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < 3) throw validation("Say why the order is being cancelled.", { reason: "Say why the order is cancelled." });
  const head = await db.purchaseOrder.findUnique({ where: { id: poId }, select: { projectId: true } });
  if (!head) throw notFound("That purchase order");
  assertCan(ctx, "update", "purchase_order", head.projectId);
  await db.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { _count: { select: { receipts: true, invoices: true } } } });
    if (po.status !== "ISSUED" || po._count.receipts > 0 || po._count.invoices > 0) throw conflict("This order already has deliveries or invoices against it, so it can't be cancelled.");
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELLED", cancelledAt: ctx.now, cancelReason: why.slice(0, 300) } });
    if (po.purchaseRequestId) await tx.purchaseRequest.updateMany({ where: { id: po.purchaseRequestId, status: "ORDERED" }, data: { status: "OPEN" } });
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "PurchaseOrder", entityId: poId, projectId: po.projectId, before: { status: "ISSUED" }, after: { status: "CANCELLED", reason: why.slice(0, 300) } });
  });
}
