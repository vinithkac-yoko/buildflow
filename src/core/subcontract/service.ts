import type { InvoiceStatus, Prisma, WorkOrderStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can, redact } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { dateKey, istToday } from "../dates";
import { conflict, notFound, validation } from "../errors";
import { PAYMENT_MODES, paymentInput } from "../procurement/schemas";
import type { Ctx } from "../types";

const num = (d: { toString(): string } | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d.toString()));
const money = (n: number) => Math.round(n * 100) / 100;
const rupees = (n: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}`;
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const midnight = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const numF = (label: string) => z.number({ invalid_type_error: `${label} must be a number.`, required_error: `Enter ${label}.` }).finite(`${label} must be a number.`);

export const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = { ISSUED: "Issued", COMPLETED: "Fully measured", CANCELLED: "Cancelled" };
export const BILL_STATUS_LABEL: Record<InvoiceStatus, string> = { UNPAID: "Unpaid", PARTIALLY_PAID: "Part paid", PAID: "Paid" };

export const workOrderInput = z.object({
  subcontractorId: z.string().min(1, "Pick the subcontractor."),
  title: z.string({ required_error: "Enter a title." }).trim().min(3, "Enter a title (a few words).").max(140),
  scope: z.string().trim().max(1000).nullish(),
  items: z.array(z.object({
    activityId: z.string().min(1, "Pick the activity."),
    description: z.string().trim().max(200).nullish(),
    quantity: numF("the quantity").gt(0, "Quantity must be more than 0."),
    workRate: numF("the rate").min(0, "Rate can't be negative."),
  })).min(1, "Add at least one activity to the work order.").max(30),
});
export const measurementInput = z.object({
  itemId: z.string().min(1, "Pick the work item."),
  quantity: numF("the measured quantity").gt(0, "Quantity must be more than 0."),
  measuredOn: dateStr.nullish(),
  note: z.string().trim().max(300).nullish(),
  clientTxnId: z.string().min(8).max(64).nullish(),
});
export const billInput = z.object({
  billNo: z.string({ required_error: "Enter the bill number." }).trim().min(1, "Enter the bill number.").max(60),
  billDate: dateStr,
  dueDate: dateStr.nullish(),
  retentionPct: numF("the retention %").min(0, "Retention can't be negative.").max(20, "Retention above 20% looks wrong — check it."),
});

/** Issue a work order to a subcontractor for activities of one project. Rates and totals are cost data. */
export async function createWorkOrder(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "work_order", projectId);
  const i = workOrderInput.parse(raw);
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true, name: true } });
    if (!project) throw notFound("That project");
    if (project.status !== "ACTIVE" && project.status !== "DELAYED") throw conflict(`${project.name} is not active, so work orders can't be issued for it.`);
    const sub = await tx.subcontractor.findUnique({ where: { id: i.subcontractorId }, select: { status: true, name: true } });
    if (!sub || sub.status !== "ACTIVE") throw validation("Pick an active subcontractor from the list.", { subcontractorId: "Pick an active subcontractor." });
    const acts = await tx.activity.findMany({ where: { id: { in: i.items.map((x) => x.activityId) }, projectId }, select: { id: true, name: true, uomId: true } });
    const byId = new Map(acts.map((a) => [a.id, a]));
    if (i.items.some((x) => !byId.has(x.activityId))) throw validation("Pick activities from this project.");
    if (new Set(i.items.map((x) => x.activityId)).size !== i.items.length) throw validation("An activity is listed twice. Combine the quantities into one line.");
    const code = await nextCode(tx, "WO");
    const wo = await tx.workOrder.create({
      data: {
        code, projectId, subcontractorId: i.subcontractorId, title: i.title, scope: i.scope || null, issuedOn: istToday(ctx.now), issuedById: ctx.userId, ...demoFlag(),
        items: { create: i.items.map((x) => ({ activityId: x.activityId, description: x.description?.trim() || byId.get(x.activityId)!.name, uomId: byId.get(x.activityId)!.uomId, quantity: x.quantity, workRate: x.workRate })) },
      },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "WorkOrder", entityId: wo.id, projectId, after: { code, subcontractor: sub.name, lines: i.items.length, total: money(i.items.reduce((s, x) => s + x.quantity * x.workRate, 0)) } });
    return wo.id;
  });
}

/** Record work measured on one line. Cumulative measurement can never exceed the ordered quantity. */
export async function recordMeasurement(ctx: Ctx, workOrderId: string, raw: unknown) {
  const i = measurementInput.parse(raw);
  const head = await db.workOrder.findUnique({ where: { id: workOrderId }, select: { projectId: true } });
  if (!head) throw notFound("That work order");
  assertCan(ctx, "update", "work_order", head.projectId);
  return db.$transaction(async (tx) => {
    if (i.clientTxnId) {
      const dup = await tx.workOrderMeasurement.findUnique({ where: { clientTxnId: i.clientTxnId } });
      if (dup) return dup.id;
    }
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "WorkOrderItem" WHERE id = ${i.itemId} AND "workOrderId" = ${workOrderId} FOR UPDATE`;
    if (rows.length === 0) throw validation("That work item isn't on this order.", { itemId: "Pick a work item from this order." });
    const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { items: { include: { uom: { select: { code: true } } } } } });
    if (wo.status !== "ISSUED") throw conflict(`${wo.code} is ${WO_STATUS_LABEL[wo.status].toLowerCase()}, so no more work can be measured on it.`);
    const item = wo.items.find((x) => x.id === i.itemId)!;
    const left = num(item.quantity) - num(item.measuredQty);
    if (i.quantity > left + 1e-9) {
      throw validation(`Only ${fmt(left)} ${item.uom.code} left on “${item.description}” (ordered ${fmt(num(item.quantity))}, measured ${fmt(num(item.measuredQty))}). Enter ${fmt(left)} or less.`, { quantity: `Only ${fmt(left)} ${item.uom.code} left on this line.` });
    }
    const date = i.measuredOn ? midnight(i.measuredOn) : istToday(ctx.now);
    if (date > istToday(ctx.now)) throw validation("The measurement date can't be in the future.", { measuredOn: "Pick today or an earlier date." });
    const m = await tx.workOrderMeasurement.create({ data: { itemId: i.itemId, measuredOn: date, quantity: i.quantity, note: i.note || null, measuredById: ctx.userId, clientTxnId: i.clientTxnId ?? null, ...demoFlag() } });
    await tx.workOrderItem.update({ where: { id: i.itemId }, data: { measuredQty: { increment: i.quantity } } }); // CHECK guards over-measurement
    const after = await tx.workOrderItem.findMany({ where: { workOrderId } });
    if (after.every((x) => num(x.measuredQty) >= num(x.quantity) - 1e-9)) await tx.workOrder.update({ where: { id: workOrderId }, data: { status: "COMPLETED" } });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "WorkOrderMeasurement", entityId: m.id, projectId: wo.projectId, activityId: item.activityId, after: { workOrder: wo.code, item: item.description, quantity: i.quantity } });
    return m.id;
  });
}

export async function cancelWorkOrder(ctx: Ctx, workOrderId: string, reason: unknown) {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < 3) throw validation("Say why the order is cancelled.", { reason: "Say why the order is cancelled." });
  const head = await db.workOrder.findUnique({ where: { id: workOrderId }, select: { projectId: true } });
  if (!head) throw notFound("That work order");
  assertCan(ctx, "update", "work_order", head.projectId);
  await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { items: { select: { measuredQty: true } } } });
    if (wo.status !== "ISSUED" || wo.items.some((x) => num(x.measuredQty) > 0)) throw conflict(`${wo.code} already has measured work, so it can't be cancelled.`);
    await tx.workOrder.update({ where: { id: workOrderId }, data: { status: "CANCELLED", cancelReason: why.slice(0, 300) } });
    await writeAudit(tx, ctx, { action: "CANCEL", entity: "WorkOrder", entityId: workOrderId, projectId: wo.projectId, before: { status: "ISSUED" }, after: { status: "CANCELLED", reason: why.slice(0, 300) } });
  });
}

/**
 * Accounts raises a bill from everything measured and not yet billed on the order. The measurements are claimed
 * with the bill, so nothing is billed twice; gross = measured quantity × rate, less retention.
 */
export async function createSubBill(ctx: Ctx, workOrderId: string, raw: unknown) {
  const i = billInput.parse(raw);
  const head = await db.workOrder.findUnique({ where: { id: workOrderId }, select: { projectId: true } });
  if (!head) throw notFound("That work order");
  assertCan(ctx, "create", "sub_bill", head.projectId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkOrder" WHERE id = ${workOrderId} FOR UPDATE`;
    const wo = await tx.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, include: { subcontractor: { select: { name: true } } } });
    if (wo.status === "CANCELLED") throw conflict(`${wo.code} was cancelled, so it can't be billed.`);
    const open = await tx.workOrderMeasurement.findMany({ where: { item: { workOrderId }, billId: null }, include: { item: { select: { workRate: true } } } });
    if (open.length === 0) throw conflict("There is no measured work waiting to be billed. Record the measurement first.");
    if (await tx.subcontractorBill.findUnique({ where: { subcontractorId_billNo: { subcontractorId: wo.subcontractorId, billNo: i.billNo } } })) {
      throw conflict(`Bill ${i.billNo} from ${wo.subcontractor.name} has already been entered.`);
    }
    const gross = money(open.reduce((s, m) => s + num(m.quantity) * num(m.item.workRate), 0));
    const retention = money((gross * i.retentionPct) / 100);
    const net = money(gross - retention);
    const bill = await tx.subcontractorBill.create({
      data: {
        code: await nextCode(tx, "SB"), workOrderId, projectId: wo.projectId, subcontractorId: wo.subcontractorId, billNo: i.billNo, billDate: midnight(i.billDate),
        dueDate: i.dueDate ? midnight(i.dueDate) : null, billGross: gross, retentionPct: i.retentionPct, billRetention: retention, billNet: net, enteredById: ctx.userId, ...demoFlag(),
      },
    });
    const claimed = await tx.workOrderMeasurement.updateMany({ where: { id: { in: open.map((m) => m.id) }, billId: null }, data: { billId: bill.id } });
    if (claimed.count !== open.length) throw conflict("Someone else billed this work at the same time. Refresh and check the bills.");
    await writeAudit(tx, ctx, { action: "CREATE", entity: "SubcontractorBill", entityId: bill.id, projectId: wo.projectId, after: { code: bill.code, billNo: i.billNo, workOrder: wo.code, gross, retention, net, measurements: open.length } });
    return bill.id;
  });
}

/** Pay a bill. The amount can never exceed what is still payable (guarded update plus a database CHECK). */
export async function recordSubPayment(ctx: Ctx, billId: string, raw: unknown) {
  const input = paymentInput.parse(raw);
  const head = await db.subcontractorBill.findUnique({ where: { id: billId }, select: { projectId: true } });
  if (!head) throw notFound("That bill");
  assertCan(ctx, "create", "payment", head.projectId);
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ billNet: unknown; billPaid: unknown }[]>`
      UPDATE "SubcontractorBill" SET "billPaid" = "billPaid" + ${input.amount}, "updatedAt" = now()
      WHERE id = ${billId} AND "billPaid" + ${input.amount} <= "billNet"
      RETURNING "billNet", "billPaid"`;
    if (rows.length === 0) {
      const b = await tx.subcontractorBill.findUniqueOrThrow({ where: { id: billId } });
      const owed = money(num(b.billNet) - num(b.billPaid));
      throw validation(owed <= 0 ? `Bill ${b.billNo} is already fully paid.` : `Only ${rupees(owed)} is still payable on bill ${b.billNo}. Enter ${rupees(owed)} or less.`, { amount: `Only ${rupees(owed)} is owed.` });
    }
    const net = money(num(rows[0].billNet as number));
    const paid = money(num(rows[0].billPaid as number));
    await tx.subcontractorBill.update({ where: { id: billId }, data: { status: paid >= net - 0.001 ? "PAID" : "PARTIALLY_PAID" } });
    const pay = await tx.subcontractorPayment.create({
      data: { code: await nextCode(tx, "SP"), billId, projectId: head.projectId, paidOn: input.paidOn ? midnight(input.paidOn) : istToday(ctx.now), subPaymentAmount: input.amount, mode: input.mode, reference: input.reference || null, paidById: ctx.userId, ...demoFlag() },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "SubcontractorPayment", entityId: pay.id, projectId: head.projectId, after: { code: pay.code, amount: input.amount, mode: input.mode, billStatus: paid >= net - 0.001 ? "PAID" : "PARTIALLY_PAID" } });
    return pay.id;
  });
}

// ── reads ──

export async function listWorkOrders(ctx: Ctx, f: { projectId?: string; status?: WorkOrderStatus } = {}) {
  assertCan(ctx, "read", "work_order");
  if (f.projectId && !ctx.allProjects && !ctx.projectIds.includes(f.projectId)) return [];
  const rows = await db.workOrder.findMany({
    where: { ...(f.projectId ? { projectId: f.projectId } : {}), ...(ctx.allProjects ? {} : { projectId: f.projectId ?? { in: [...ctx.projectIds] } }), ...(f.status ? { status: f.status } : {}) },
    include: { project: { select: { code: true, name: true } }, subcontractor: { select: { name: true } }, items: { select: { quantity: true, measuredQty: true, workRate: true, measurements: { where: { billId: null }, select: { quantity: true } } } }, bills: { select: { billNet: true, billPaid: true } } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return rows.map((w) => {
    const ordered = w.items.reduce((s, x) => s + num(x.quantity), 0);
    const measured = w.items.reduce((s, x) => s + num(x.measuredQty), 0);
    return redact(ctx, {
      id: w.id, code: w.code, projectId: w.projectId, projectCode: w.project.code, projectName: w.project.name, subcontractor: w.subcontractor.name, title: w.title, status: w.status,
      issuedOn: dateKey(w.issuedOn), lines: w.items.length, measuredPct: ordered > 0 ? Math.round((measured / ordered) * 100) : 0,
      workTotal: money(w.items.reduce((s, x) => s + num(x.quantity) * num(x.workRate), 0)), billed: money(w.bills.reduce((s, b) => s + num(b.billNet), 0)),
      unbilledValue: money(w.items.reduce((s, x) => s + x.measurements.reduce((m, q) => m + num(q.quantity), 0) * num(x.workRate), 0)),
    }, w.projectId);
  });
}
export type WorkOrderRow = Awaited<ReturnType<typeof listWorkOrders>>[number];

export async function getWorkOrder(ctx: Ctx, id: string) {
  const w = await db.workOrder.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } }, subcontractor: { select: { id: true, name: true, contact: true } }, issuedBy: { select: { name: true } },
      items: { include: { uom: { select: { code: true } }, activity: { select: { code: true, name: true } }, measurements: { orderBy: [{ measuredOn: "asc" }, { createdAt: "asc" }], include: { measuredBy: { select: { name: true } } } } }, orderBy: { activity: { code: "asc" } } },
      bills: { include: { payments: { orderBy: { paidOn: "asc" } } }, orderBy: { billDate: "asc" } },
    },
  });
  if (!w) throw notFound("That work order");
  assertCan(ctx, "read", "work_order", w.projectId);
  const items = w.items.map((it) => {
    const qty = num(it.quantity);
    const billed = it.measurements.filter((m) => m.billId).reduce((s, m) => s + num(m.quantity), 0);
    return {
      id: it.id, activityId: it.activityId, activity: `${it.activity.code} ${it.activity.name}`, description: it.description, unit: it.uom.code, quantity: qty, measuredQty: num(it.measuredQty),
      remaining: money(qty - num(it.measuredQty)), unbilledQty: money(num(it.measuredQty) - billed), workRate: num(it.workRate), workAmount: money(qty * num(it.workRate)),
      measurements: it.measurements.map((m) => ({ id: m.id, on: dateKey(m.measuredOn), quantity: num(m.quantity), note: m.note, by: m.measuredBy.name, billed: !!m.billId })),
    };
  });
  const unbilledValue = money(items.reduce((s, x) => s + x.unbilledQty * x.workRate, 0));
  const billsTotal = money(w.bills.reduce((s, b) => s + num(b.billNet), 0));
  const paid = money(w.bills.reduce((s, b) => s + num(b.billPaid), 0));
  return redact(ctx, {
    id: w.id, code: w.code, projectId: w.projectId, projectCode: w.project.code, projectName: w.project.name, subcontractor: w.subcontractor, title: w.title, scope: w.scope, status: w.status,
    issuedOn: dateKey(w.issuedOn), issuedBy: w.issuedBy.name, cancelReason: w.cancelReason, items,
    workTotal: money(items.reduce((s, x) => s + x.workAmount, 0)),
    bills: w.bills.map((b) => ({
      id: b.id, code: b.code, projectId: w.projectId, billNo: b.billNo, billDate: dateKey(b.billDate), dueDate: b.dueDate ? dateKey(b.dueDate) : null, status: b.status, retentionPct: num(b.retentionPct),
      billGross: num(b.billGross), billRetention: num(b.billRetention), billNet: num(b.billNet), billPaid: num(b.billPaid), outstanding: money(num(b.billNet) - num(b.billPaid)),
      payments: b.payments.map((p) => ({ id: p.id, code: p.code, paidOn: dateKey(p.paidOn), mode: p.mode, reference: p.reference, subPaymentAmount: num(p.subPaymentAmount) })),
    })),
    summary: { unbilledValue, billed: billsTotal, paid, outstanding: money(billsTotal - paid) },
    canMeasure: w.status === "ISSUED" && can(ctx, "update", "work_order", w.projectId),
    canBill: w.status !== "CANCELLED" && can(ctx, "create", "sub_bill", w.projectId) && items.some((x) => x.unbilledQty > 0),
    canPay: can(ctx, "create", "payment", w.projectId),
    canCancel: w.status === "ISSUED" && items.every((x) => x.measuredQty === 0) && can(ctx, "update", "work_order", w.projectId),
  }, w.projectId);
}
export type WorkOrderDetail = Awaited<ReturnType<typeof getWorkOrder>>;

/** Subcontractor bills for the payables screen. */
export async function listSubBills(ctx: Ctx, f: { projectId?: string; status?: InvoiceStatus | "OPEN" } = {}) {
  assertCan(ctx, "read", "sub_bill");
  const today = istToday(ctx.now);
  const where: Prisma.SubcontractorBillWhereInput = {
    ...(f.projectId ? { projectId: f.projectId } : {}),
    ...(ctx.allProjects ? {} : { projectId: f.projectId ?? { in: [...ctx.projectIds] } }),
    ...(f.status === "OPEN" ? { status: { in: ["UNPAID", "PARTIALLY_PAID"] as InvoiceStatus[] } } : f.status ? { status: f.status } : {}),
  };
  const rows = await db.subcontractorBill.findMany({
    where, include: { workOrder: { select: { id: true, code: true } }, subcontractor: { select: { name: true } }, project: { select: { code: true, name: true } } }, orderBy: [{ billDate: "desc" }], take: 150,
  });
  const items = rows.map((b) => {
    const outstanding = money(num(b.billNet) - num(b.billPaid));
    const overdue = b.dueDate !== null && b.dueDate < today && outstanding > 0;
    return redact(ctx, {
      id: b.id, code: b.code, projectId: b.projectId, projectCode: b.project.code, projectName: b.project.name, subcontractor: b.subcontractor.name, workOrderId: b.workOrder.id, workOrderCode: b.workOrder.code,
      billNo: b.billNo, billDate: dateKey(b.billDate), dueDate: b.dueDate ? dateKey(b.dueDate) : null, status: b.status, overdue, billNet: num(b.billNet), billPaid: num(b.billPaid), outstanding,
    }, b.projectId);
  });
  const sum = (k: "billNet" | "billPaid" | "outstanding") => money(items.reduce((s, i) => s + (i[k] ?? 0), 0));
  return { items, totals: { billed: sum("billNet"), paid: sum("billPaid"), outstanding: sum("outstanding"), overdue: money(items.filter((i) => i.overdue).reduce((s, i) => s + (i.outstanding ?? 0), 0)) } };
}
export type SubBillRow = Awaited<ReturnType<typeof listSubBills>>["items"][number];
export { PAYMENT_MODES };
