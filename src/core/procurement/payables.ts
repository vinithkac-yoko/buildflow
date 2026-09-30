import type { InvoiceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, redact } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { dateKey, istToday } from "../dates";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";
import { invoiceInput, paymentInput } from "./schemas";

const num = (d: { toString(): string } | number) => Number(d.toString());
const money = (n: number) => Math.round(n * 100) / 100;
const rupees = (n: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}`;
const midnight = (s: string) => new Date(`${s}T00:00:00.000Z`);

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { UNPAID: "Unpaid", PARTIALLY_PAID: "Part paid", PAID: "Paid" };

/**
 * Accounts records the vendor's invoice against a PO. The order must have had a delivery, the invoice number
 * can't repeat for that vendor, and all invoices together can't exceed the PO value.
 */
export async function createInvoice(ctx: Ctx, orderId: string, raw: unknown) {
  const input = invoiceInput.parse(raw);
  const head = await db.purchaseOrder.findUnique({ where: { id: orderId }, select: { projectId: true } });
  if (!head) throw notFound("That purchase order");
  assertCan(ctx, "create", "invoice", head.projectId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${orderId} FOR UPDATE`;
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { invoices: { select: { invoiceTotal: true } }, _count: { select: { receipts: true } }, vendor: { select: { name: true } } } });
    if (po.status === "CANCELLED") throw conflict("This order was cancelled, so it can't be invoiced.");
    if (po._count.receipts === 0) throw conflict("Nothing has been received against this order yet. Record the delivery (goods receipt) first, then the invoice.");

    const total = money(input.subtotal + input.tax);
    if (total <= 0) throw validation("The invoice total must be more than zero.", { subtotal: "Enter the amount before tax." });
    const already = money(po.invoices.reduce((s, v) => s + num(v.invoiceTotal), 0));
    const room = money(num(po.poTotal) - already);
    if (total > room + 0.01) {
      throw validation(`This invoice (${rupees(total)}) is more than what is left on ${po.code} (${rupees(Math.max(0, room))} of ${rupees(num(po.poTotal))}). Check the amounts, or ask Procurement to amend the order.`, { subtotal: `More than what is left on the order (${rupees(Math.max(0, room))} incl. tax).` });
    }
    if (await tx.vendorInvoice.findUnique({ where: { vendorId_invoiceNo: { vendorId: po.vendorId, invoiceNo: input.invoiceNo } } })) {
      throw conflict(`Invoice ${input.invoiceNo} from ${po.vendor.name} has already been entered.`);
    }
    const code = await nextCode(tx, "VI");
    const inv = await tx.vendorInvoice.create({
      data: {
        code, orderId, projectId: po.projectId, vendorId: po.vendorId, invoiceNo: input.invoiceNo, invoiceDate: midnight(input.invoiceDate),
        dueDate: input.dueDate ? midnight(input.dueDate) : null, invoiceSubtotal: input.subtotal, invoiceTax: input.tax, invoiceTotal: total,
        enteredById: ctx.userId, ...demoFlag(),
      },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "VendorInvoice", entityId: inv.id, projectId: po.projectId, after: { code, invoiceNo: input.invoiceNo, total, order: po.code } });
    return inv.id;
  });
}

/** Record a payment against an invoice. The amount can never exceed what is still owed (checked here and by the database). */
export async function recordPayment(ctx: Ctx, invoiceId: string, raw: unknown) {
  const input = paymentInput.parse(raw);
  const head = await db.vendorInvoice.findUnique({ where: { id: invoiceId }, select: { projectId: true } });
  if (!head) throw notFound("That invoice");
  assertCan(ctx, "create", "payment", head.projectId);
  return db.$transaction(async (tx) => {
    // Atomic: add to paidAmount only if it still fits. Two people paying at once can't overpay.
    const rows = await tx.$queryRaw<{ invoiceTotal: unknown; paidAmount: unknown }[]>`
      UPDATE "VendorInvoice" SET "paidAmount" = "paidAmount" + ${input.amount}, "updatedAt" = now()
      WHERE id = ${invoiceId} AND "paidAmount" + ${input.amount} <= "invoiceTotal"
      RETURNING "invoiceTotal", "paidAmount"`;
    if (rows.length === 0) {
      const inv = await tx.vendorInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      const owed = money(num(inv.invoiceTotal) - num(inv.paidAmount));
      throw validation(owed <= 0 ? `Invoice ${inv.invoiceNo} is already fully paid.` : `Only ${rupees(owed)} is still owed on invoice ${inv.invoiceNo}. Enter ${rupees(owed)} or less.`, { amount: `Only ${rupees(owed)} is owed.` });
    }
    const total = money(num(rows[0].invoiceTotal as number));
    const paid = money(num(rows[0].paidAmount as number));
    await tx.vendorInvoice.update({ where: { id: invoiceId }, data: { status: paid >= total - 0.001 ? "PAID" : "PARTIALLY_PAID" } });
    const code = await nextCode(tx, "PAY");
    const pay = await tx.vendorPayment.create({
      data: {
        code, invoiceId, projectId: head.projectId, paymentAmount: input.amount, paidOn: input.paidOn ? midnight(input.paidOn) : istToday(ctx.now),
        mode: input.mode, reference: input.reference || null, paidById: ctx.userId, ...demoFlag(),
      },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "VendorPayment", entityId: pay.id, projectId: head.projectId, after: { code, amount: input.amount, mode: input.mode, invoiceStatus: paid >= total - 0.001 ? "PAID" : "PARTIALLY_PAID" } });
    return pay.id;
  });
}

/** Payables: every vendor invoice with what is paid and what is still owed. Accounts and the Owner. */
export async function listPayables(ctx: Ctx, f: { projectId?: string; status?: InvoiceStatus | "OPEN"; vendorId?: string } = {}) {
  assertCan(ctx, "read", "invoice");
  const today = istToday(ctx.now);
  const rows = await db.vendorInvoice.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(f.vendorId ? { vendorId: f.vendorId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ? f.projectId : { in: [...ctx.projectIds] } }),
      ...(f.status === "OPEN" ? { status: { in: ["UNPAID", "PARTIALLY_PAID"] as InvoiceStatus[] } } : f.status ? { status: f.status } : {}),
    },
    include: { order: { select: { id: true, code: true } }, vendor: { select: { name: true } }, project: { select: { code: true, name: true } } },
    orderBy: [{ invoiceDate: "desc" }],
    take: 150,
  });
  const items = rows.map((v) => {
    const outstanding = money(num(v.invoiceTotal) - num(v.paidAmount));
    const overdue = v.dueDate !== null && v.dueDate < today && outstanding > 0;
    return redact(ctx, {
      id: v.id, code: v.code, projectId: v.projectId, projectCode: v.project.code, projectName: v.project.name, vendor: v.vendor.name, orderId: v.order.id, orderCode: v.order.code,
      invoiceNo: v.invoiceNo, invoiceDate: dateKey(v.invoiceDate), dueDate: v.dueDate ? dateKey(v.dueDate) : null, status: v.status, overdue,
      invoiceTotal: num(v.invoiceTotal), paidAmount: num(v.paidAmount), outstanding,
    }, v.projectId);
  });
  const sum = (k: "invoiceTotal" | "paidAmount" | "outstanding") => money(items.reduce((s, i) => s + (i[k] ?? 0), 0));
  return { items, totals: { invoiced: sum("invoiceTotal"), paid: sum("paidAmount"), outstanding: sum("outstanding"), overdue: money(items.filter((i) => i.overdue).reduce((s, i) => s + (i.outstanding ?? 0), 0)) } };
}
export type PayableRow = Awaited<ReturnType<typeof listPayables>>["items"][number];
