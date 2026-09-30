import type { Prisma, PrStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can, redact } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { dateKey } from "../dates";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";
import { poInput, quotationInput } from "./schemas";

const num = (d: { toString(): string } | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d.toString()));
const money = (n: number) => Math.round(n * 100) / 100;
const midnight = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Line amounts: subtotal = quantity × rate, tax = subtotal × tax %, everything rounded to paise. */
export function lineAmounts(quantity: number, unitRate: number, taxPct: number) {
  const subtotal = money(quantity * unitRate);
  const tax = money((subtotal * taxPct) / 100);
  return { subtotal, tax, total: money(subtotal + tax) };
}

export const PR_STATUS_LABEL: Record<PrStatus, string> = { OPEN: "Getting quotations", ORDERED: "Ordered", CANCELLED: "Cancelled" };

export async function listPurchaseRequests(ctx: Ctx, f: { projectId?: string; status?: PrStatus } = {}) {
  assertCan(ctx, "read", "purchase_request");
  const rows = await db.purchaseRequest.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ? f.projectId : { in: [...ctx.projectIds] } }),
      ...(f.status ? { status: f.status } : {}),
    },
    include: {
      project: { select: { code: true, name: true } },
      items: { include: { material: { select: { name: true, uom: { select: { code: true } } } } } },
      quotations: { select: { id: true, status: true, vendor: { select: { name: true } } } },
      orders: { select: { id: true, code: true, status: true } },
      raisedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const allowed = new Set(ctx.projectIds);
  return rows.filter((r) => ctx.allProjects || allowed.has(r.projectId)).map((r) => ({
    id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, status: r.status,
    raisedBy: r.raisedBy.name, neededBy: r.neededBy ? dateKey(r.neededBy) : null, createdAt: r.createdAt.toISOString(),
    items: r.items.map((i) => ({ material: i.material.name, unit: i.material.uom.code, quantity: num(i.quantity) })),
    quotations: r.quotations.length, selectedVendor: r.quotations.find((q) => q.status === "SELECTED")?.vendor.name ?? null,
    order: r.orders.find((o) => o.status !== "CANCELLED") ?? null,
  }));
}
export type PurchaseRequestRow = Awaited<ReturnType<typeof listPurchaseRequests>>[number];

export async function getPurchaseRequest(ctx: Ctx, id: string) {
  const r = await db.purchaseRequest.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } }, raisedBy: { select: { name: true } },
      materialRequest: { select: { id: true, code: true, requestedBy: { select: { name: true } } } },
      items: { include: { material: { select: { id: true, name: true, uom: { select: { code: true } } } } }, orderBy: { material: { name: "asc" } } },
      quotations: { include: { vendor: { select: { id: true, name: true, category: true } }, items: true }, orderBy: { createdAt: "asc" } },
      orders: { select: { id: true, code: true, status: true } },
    },
  });
  if (!r) throw notFound("That purchase request");
  assertCan(ctx, "read", "purchase_request", r.projectId);

  const quotes = r.quotations.map((q) => {
    let subtotal = 0;
    let tax = 0;
    const lines = r.items.map((it) => {
      const qi = q.items.find((x) => x.prItemId === it.id);
      const a = qi ? lineAmounts(num(it.quantity), num(qi.unitRate), num(qi.taxPct)) : { subtotal: 0, tax: 0, total: 0 };
      subtotal += a.subtotal;
      tax += a.tax;
      return { prItemId: it.id, unitRate: qi ? num(qi.unitRate) : 0, taxPct: qi ? num(qi.taxPct) : 0, lineTotal: a.total };
    });
    return {
      id: q.id, code: q.code, projectId: r.projectId, vendorId: q.vendor.id, vendor: q.vendor.name, vendorCategory: q.vendor.category, quoteRef: q.quoteRef,
      quotedOn: dateKey(q.quotedOn), validUntil: q.validUntil ? dateKey(q.validUntil) : null, deliveryDays: q.deliveryDays, paymentTerms: q.paymentTerms,
      status: q.status, poTotal: money(subtotal + tax), lines,
    };
  });
  const activeOrder = r.orders.find((o) => o.status !== "CANCELLED") ?? null;
  const view = {
    id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, status: r.status,
    raisedBy: r.raisedBy.name, neededBy: r.neededBy ? dateKey(r.neededBy) : null, note: r.note, materialRequest: r.materialRequest,
    items: r.items.map((i) => ({ id: i.id, materialId: i.material.id, material: i.material.name, unit: i.material.uom.code, quantity: num(i.quantity) })),
    quotations: quotes, orders: r.orders, activeOrder,
    canQuote: r.status === "OPEN" && can(ctx, "create", "quotation", r.projectId),
    canSelect: r.status === "OPEN" && can(ctx, "update", "quotation", r.projectId),
    canOrder: r.status === "OPEN" && can(ctx, "create", "purchase_order", r.projectId),
    canCancel: r.status === "OPEN" && can(ctx, "update", "purchase_request", r.projectId),
  };
  return redact(ctx, view, r.projectId);
}
export type PurchaseRequestDetail = Awaited<ReturnType<typeof getPurchaseRequest>>;

export async function addQuotation(ctx: Ctx, prId: string, raw: unknown) {
  const input = quotationInput.parse(raw);
  const head = await db.purchaseRequest.findUnique({ where: { id: prId }, select: { projectId: true } });
  if (!head) throw notFound("That purchase request");
  assertCan(ctx, "create", "quotation", head.projectId);
  return db.$transaction(async (tx) => {
    const pr = await tx.purchaseRequest.findUniqueOrThrow({ where: { id: prId }, include: { items: true } });
    if (pr.status !== "OPEN") throw conflict("This purchase request is no longer open for quotations.");
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor || vendor.status !== "ACTIVE") throw validation("Pick an active vendor from the list.", { vendorId: "Pick an active vendor." });
    if (await tx.vendorQuotation.findUnique({ where: { purchaseRequestId_vendorId: { purchaseRequestId: prId, vendorId: input.vendorId } } })) {
      throw conflict(`${vendor.name} has already quoted on this request. Remove their quotation first if it needs correcting.`, );
    }
    const ids = new Set(pr.items.map((i) => i.id));
    const got = new Set(input.items.map((i) => i.prItemId));
    if (got.size !== ids.size || [...ids].some((i) => !got.has(i))) throw validation("Enter a rate for every material on the request.");

    const code = await nextCode(tx, "QTN");
    const q = await tx.vendorQuotation.create({
      data: {
        code, purchaseRequestId: prId, vendorId: input.vendorId, quoteRef: input.quoteRef || null,
        quotedOn: input.quotedOn ? midnight(input.quotedOn) : new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate())),
        validUntil: input.validUntil ? midnight(input.validUntil) : null, deliveryDays: input.deliveryDays ?? null, paymentTerms: input.paymentTerms || null,
        enteredById: ctx.userId, ...demoFlag(),
        items: { create: input.items.map((i) => ({ prItemId: i.prItemId, unitRate: i.unitRate, taxPct: i.taxPct })) },
      },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "VendorQuotation", entityId: q.id, projectId: pr.projectId, after: { code, vendor: vendor.name } });
    return q.id;
  });
}

export async function removeQuotation(ctx: Ctx, quotationId: string) {
  const q = await db.vendorQuotation.findUnique({ where: { id: quotationId }, include: { purchaseRequest: { select: { projectId: true, status: true } }, vendor: { select: { name: true } } } });
  if (!q) throw notFound("That quotation");
  assertCan(ctx, "update", "quotation", q.purchaseRequest.projectId);
  if (q.purchaseRequest.status !== "OPEN") throw conflict("The request is already ordered, so its quotations can't be removed.");
  await db.$transaction(async (tx) => {
    await tx.vendorQuotation.delete({ where: { id: quotationId } });
    await tx.vendorQuotation.updateMany({ where: { purchaseRequestId: q.purchaseRequestId, status: { not: "RECEIVED" } }, data: { status: "RECEIVED" } }); // choose again
    await writeAudit(tx, ctx, { action: "DELETE", entity: "VendorQuotation", entityId: quotationId, projectId: q.purchaseRequest.projectId, before: { code: q.code, vendor: q.vendor.name } });
  });
}

/** Pick the winning quotation. At least two quotations are needed, so a price is always compared. */
export async function selectQuotation(ctx: Ctx, quotationId: string) {
  const q = await db.vendorQuotation.findUnique({ where: { id: quotationId }, include: { purchaseRequest: { select: { id: true, projectId: true, status: true } } } });
  if (!q) throw notFound("That quotation");
  assertCan(ctx, "update", "quotation", q.purchaseRequest.projectId);
  return db.$transaction(async (tx) => {
    if (q.purchaseRequest.status !== "OPEN") throw conflict("This request is already ordered, so the choice can't change. Cancel the PO first if it is wrong.");
    const all = await tx.vendorQuotation.findMany({ where: { purchaseRequestId: q.purchaseRequestId }, select: { id: true } });
    if (all.length < 2) throw conflict(`Add at least 2 quotations before choosing one (there ${all.length === 1 ? "is 1" : "are 0"} so far).`);
    await tx.vendorQuotation.updateMany({ where: { purchaseRequestId: q.purchaseRequestId }, data: { status: "NOT_SELECTED" } });
    await tx.vendorQuotation.update({ where: { id: quotationId }, data: { status: "SELECTED" } });
    await writeAudit(tx, ctx, { action: "SELECT", entity: "VendorQuotation", entityId: quotationId, projectId: q.purchaseRequest.projectId, after: { code: q.code } });
  });
}

/** Raise the purchase order from the selected quotation: same materials, quantities, rates and tax. */
export async function createPurchaseOrder(ctx: Ctx, prId: string, raw: unknown) {
  const input = poInput.parse(raw ?? {});
  const head = await db.purchaseRequest.findUnique({ where: { id: prId }, select: { projectId: true } });
  if (!head) throw notFound("That purchase request");
  assertCan(ctx, "create", "purchase_order", head.projectId);
  return db.$transaction(async (tx) => {
    const claimed = await tx.purchaseRequest.updateMany({ where: { id: prId, status: "OPEN" }, data: { status: "ORDERED" } });
    if (claimed.count === 0) throw conflict("A purchase order has already been raised for this request.");
    const pr = await tx.purchaseRequest.findUniqueOrThrow({ where: { id: prId }, include: { items: true, quotations: { where: { status: "SELECTED" }, include: { items: true } } } });
    const sel = pr.quotations[0];
    if (!sel) throw conflict("Choose a quotation first — the order is raised from the chosen vendor's rates.");

    const lines = pr.items.map((it) => {
      const qi = sel.items.find((x) => x.prItemId === it.id);
      if (!qi) throw validation("The chosen quotation is missing a material.");
      return { it, qi, a: lineAmounts(num(it.quantity), num(qi.unitRate), num(qi.taxPct)) };
    });
    const poSubtotal = money(lines.reduce((s, l) => s + l.a.subtotal, 0));
    const poTax = money(lines.reduce((s, l) => s + l.a.tax, 0));
    const year = ctx.now.getUTCFullYear();
    const code = await nextCode(tx, `PO-${year}`, { key: `PO:${year}` });
    const po = await tx.purchaseOrder.create({
      data: {
        code, projectId: pr.projectId, vendorId: sel.vendorId, purchaseRequestId: pr.id, quotationId: sel.id, orderDate: new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate())),
        expectedDate: input.expectedDate ? midnight(input.expectedDate) : sel.deliveryDays ? new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate() + sel.deliveryDays)) : null,
        terms: input.terms || sel.paymentTerms || null, poSubtotal, poTax, poTotal: money(poSubtotal + poTax), raisedById: ctx.userId, ...demoFlag(),
        items: { create: lines.map((l) => ({ materialId: l.it.materialId, quantity: l.it.quantity, unitRate: l.qi.unitRate, taxPct: l.qi.taxPct })) },
      },
    });
    await writeAudit(tx, ctx, {
      action: "CREATE", entity: "PurchaseOrder", entityId: po.id, projectId: pr.projectId,
      after: { code, vendor: sel.vendorId, lines: lines.length, total: money(poSubtotal + poTax) },
    });
    return po.id;
  });
}

export async function cancelPurchaseRequest(ctx: Ctx, prId: string) {
  const head = await db.purchaseRequest.findUnique({ where: { id: prId }, select: { projectId: true } });
  if (!head) throw notFound("That purchase request");
  assertCan(ctx, "update", "purchase_request", head.projectId);
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.purchaseRequest.updateMany({ where: { id: prId, status: "OPEN" }, data: { status: "CANCELLED" } });
    if (res.count === 0) throw conflict("Only requests that are still getting quotations can be cancelled.");
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "PurchaseRequest", entityId: prId, projectId: head.projectId });
  });
}
