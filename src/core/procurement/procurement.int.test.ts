import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { buildCtx } from "@/core/auth/ctx";
import { db } from "@/lib/db";
import { AppError } from "@/core/errors";
import { adjustStock, issueStock, transferStock } from "@/core/inventory/operations";
import { stockForProject } from "@/core/inventory/stock";
import { cleanupFixture, hasDb, makeFixture, type Fixture } from "@/test/factory";
import { addQuotation, createPurchaseOrder, getPurchaseRequest, selectQuotation } from "./orders";
import { createInvoice, listPayables, recordPayment } from "./payables";
import { getPurchaseOrder } from "./purchase-orders";
import { recordReceipt } from "./receipts";
import { convertToPurchaseRequest, createMaterialRequest, getMaterialRequest } from "./requests";

async function expectError(p: Promise<unknown>, re: RegExp) {
  await expect(p).rejects.toSatisfy((e: unknown) => (e instanceof AppError ? re.test(e.message) : false));
}

describe.skipIf(!hasDb)("Flow B — procurement, stock and payables (integration)", () => {
  const fixtures: Fixture[] = [];
  const vendorIds: string[] = [];
  afterAll(async () => {
    for (const f of fixtures) await cleanupFixture(f);
    await db.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await db.$disconnect();
  });

  async function setup() {
    const f = await makeFixture({ cementMain: 0, cementYard: 0 });
    fixtures.push(f);
    const mk = async (role: Role, assign: boolean) => {
      const user = await db.user.create({ data: { email: `${role.toLowerCase()}-x-${f.u}@test.local`, name: `${role} ${f.u}`, passwordHash: "x", role } });
      if (assign) await db.projectAssignment.create({ data: { userId: user.id, projectId: f.project.id } });
      return buildCtx(user, f.now);
    };
    const proc = await mk("PROCUREMENT", false);
    const store = await mk("STORE_KEEPER", true);
    const accounts = await mk("ACCOUNTS", false);
    const vendors = await Promise.all([1, 2].map((n) => db.vendor.create({ data: { code: `TV-${f.u}-${n}`, name: `Test vendor ${f.u} ${n}`, category: "Cement & Steel" } })));
    vendors.forEach((v) => vendorIds.push(v.id));
    return { f, proc, store, accounts, vendors };
  }

  /** MR → PR → two quotations → chosen → PO for 100 bags (at ₹380 vs ₹400). */
  async function toPurchaseOrder(s: Awaited<ReturnType<typeof setup>>) {
    const { f, proc, vendors } = s;
    const mrId = await createMaterialRequest(f.ctx.se, f.project.id, { items: [{ materialId: f.cement.id, quantity: 100 }] });
    const prId = await convertToPurchaseRequest(f.ctx.pm, mrId);
    const items = (await getPurchaseRequest(proc, prId)).items;
    const q = (vendorId: string, rate: number) => addQuotation(proc, prId, { vendorId, items: items.map((i) => ({ prItemId: i.id, unitRate: rate, taxPct: 18 })) });
    const q1 = await q(vendors[0].id, 400);
    const q2 = await q(vendors[1].id, 380);
    await selectQuotation(proc, q2);
    const poId = await createPurchaseOrder(proc, prId, {});
    return { mrId, prId, q1, q2, poId };
  }

  it("a material request converts to a purchase request exactly once, and site staff cannot convert", async () => {
    const { f } = await setup();
    const mrId = await createMaterialRequest(f.ctx.se, f.project.id, { items: [{ materialId: f.cement.id, quantity: 25 }] });
    await expectError(convertToPurchaseRequest(f.ctx.se, mrId), /access/i);
    await convertToPurchaseRequest(f.ctx.pm, mrId);
    await expectError(convertToPurchaseRequest(f.ctx.pm, mrId), /already been handled/);
    expect(await db.purchaseRequest.count({ where: { materialRequestId: mrId } })).toBe(1);
    expect((await getMaterialRequest(f.ctx.pm, mrId)).status).toBe("CONVERTED");
  });

  it("replaying a request with the same client id creates only one (offline outbox safety)", async () => {
    const { f } = await setup();
    const body = { items: [{ materialId: f.cement.id, quantity: 5 }], clientTxnId: `txn-${f.u}-abcd` };
    const a = await createMaterialRequest(f.ctx.se, f.project.id, body);
    const b = await createMaterialRequest(f.ctx.se, f.project.id, body);
    expect(b).toBe(a);
  });

  it("needs two quotations before one can be chosen, and a PO before nothing is chosen is refused", async () => {
    const s = await setup();
    const { f, proc, vendors } = s;
    const mrId = await createMaterialRequest(f.ctx.se, f.project.id, { items: [{ materialId: f.cement.id, quantity: 10 }] });
    const prId = await convertToPurchaseRequest(f.ctx.pm, mrId);
    const items = (await getPurchaseRequest(proc, prId)).items;
    const only = await addQuotation(proc, prId, { vendorId: vendors[0].id, items: items.map((i) => ({ prItemId: i.id, unitRate: 390, taxPct: 18 })) });
    await expectError(selectQuotation(proc, only), /at least 2 quotations/);
    await expectError(createPurchaseOrder(proc, prId, {}), /Choose a quotation first/);
    // The same vendor can't quote twice, and every material needs a rate.
    await expectError(addQuotation(proc, prId, { vendorId: vendors[0].id, items: items.map((i) => ({ prItemId: i.id, unitRate: 1, taxPct: 18 })) }), /already quoted/);
  });

  it("raises the PO from the chosen quotation's rates; it can't be raised twice", async () => {
    const s = await setup();
    const { prId, poId } = await toPurchaseOrder(s);
    const po = await getPurchaseOrder(s.proc, poId);
    expect(po.lines[0].unitRate).toBe(380);
    expect(po.poSubtotal).toBe(38000);
    expect(po.poTax).toBe(6840);
    expect(po.poTotal).toBe(44840);
    expect(po.code).toMatch(/^PO-\d{4}-\d{4}$/);
    await expectError(createPurchaseOrder(s.proc, prId, {}), /already been raised/);
  });

  it("partial receipts post stock at the PO rate; over-receipt is refused with a friendly message", async () => {
    const s = await setup();
    const { poId } = await toPurchaseOrder(s);
    const po = await getPurchaseOrder(s.store, poId);
    const line = po.lines[0];

    await recordReceipt(s.store, poId, { storageLocationId: s.f.mainStore.id, challanNo: "DC-1", items: [{ poItemId: line.id, quantity: 60 }] });
    let stock = await stockForProject(s.f.ctx.owner, s.f.project.id);
    expect(stock[0].total).toBe(60);
    expect((await getPurchaseOrder(s.store, poId)).status).toBe("PARTIALLY_RECEIVED");

    await expectError(recordReceipt(s.store, poId, { storageLocationId: s.f.mainStore.id, items: [{ poItemId: line.id, quantity: 50 }] }), /Only 40 .* still due/);
    expect((await stockForProject(s.f.ctx.owner, s.f.project.id))[0].total).toBe(60); // nothing partly posted

    await recordReceipt(s.store, poId, { storageLocationId: s.f.yard.id, items: [{ poItemId: line.id, quantity: 40 }] });
    stock = await stockForProject(s.f.ctx.owner, s.f.project.id);
    expect(stock[0].total).toBe(100);
    expect((await getPurchaseOrder(s.store, poId)).status).toBe("RECEIVED");
    await expectError(recordReceipt(s.store, poId, { storageLocationId: s.f.mainStore.id, items: [{ poItemId: line.id, quantity: 1 }] }), /already fully received/);

    // The database also refuses over-receipt, whatever the service does.
    await expect(db.purchaseOrderItem.update({ where: { id: line.id }, data: { receivedQty: 101 } })).rejects.toThrow();
  });

  it("issuing more than stock gives a friendly error and changes nothing; the database also refuses", async () => {
    const s = await setup();
    const { f, store } = s;
    const { poId } = await toPurchaseOrder(s);
    const line = (await getPurchaseOrder(store, poId)).lines[0];
    await recordReceipt(store, poId, { storageLocationId: f.mainStore.id, items: [{ poItemId: line.id, quantity: 30 }] });

    await issueStock(store, f.project.id, { materialId: f.cement.id, quantity: 10, activityId: f.actA.id });
    await expectError(issueStock(store, f.project.id, { materialId: f.cement.id, quantity: 25, activityId: f.actA.id }), /Only 20 .* in stock/);
    await expectError(issueStock(store, f.project.id, { materialId: f.cement.id, quantity: 25, activityId: f.actA.id, storageLocationId: f.mainStore.id }), /Only 20/);
    expect((await stockForProject(f.ctx.owner, f.project.id))[0].total).toBe(20);
    await expect(db.$executeRaw`UPDATE "StockBalance" SET quantity = -1 WHERE "projectId" = ${f.project.id}`).rejects.toThrow();
    // Site engineers can't issue stock.
    await expectError(issueStock(f.ctx.se, f.project.id, { materialId: f.cement.id, quantity: 1, activityId: f.actA.id }), /access/i);
  });

  it("a transfer moves stock between locations as one paired entry, or not at all", async () => {
    const s = await setup();
    const { f, store } = s;
    const { poId } = await toPurchaseOrder(s);
    const line = (await getPurchaseOrder(store, poId)).lines[0];
    await recordReceipt(store, poId, { storageLocationId: f.mainStore.id, items: [{ poItemId: line.id, quantity: 50 }] });

    await transferStock(store, f.project.id, { materialId: f.cement.id, quantity: 20, fromLocationId: f.mainStore.id, toProjectId: f.project.id, toLocationId: f.yard.id });
    const rows = await stockForProject(f.ctx.owner, f.project.id);
    expect(rows[0].total).toBe(50);
    expect(rows[0].locations.map((l) => `${l.name}:${l.quantity}`).sort()).toEqual(["Main Store:30", "Yard:20"]);
    const ledger = await db.inventoryLedger.findMany({ where: { projectId: f.project.id, type: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } });
    expect(ledger.map((l) => l.type).sort()).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);

    // Too much: the out leg fails, so no in leg exists either.
    await expectError(transferStock(store, f.project.id, { materialId: f.cement.id, quantity: 99, fromLocationId: f.mainStore.id, toProjectId: f.project.id, toLocationId: f.yard.id }), /Only 30/);
    expect(await db.inventoryLedger.count({ where: { projectId: f.project.id, type: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } })).toBe(2);
  });

  it("stock count adjustments: loss removes, gain adds, both leave a ledger line with the note", async () => {
    const s = await setup();
    const { f, store } = s;
    const { poId } = await toPurchaseOrder(s);
    await recordReceipt(store, poId, { storageLocationId: f.mainStore.id, items: [{ poItemId: (await getPurchaseOrder(store, poId)).lines[0].id, quantity: 40 }] });
    await adjustStock(store, f.project.id, { materialId: f.cement.id, storageLocationId: f.mainStore.id, kind: "WASTAGE", quantity: 3, note: "Bags damaged by rain" });
    await adjustStock(store, f.project.id, { materialId: f.cement.id, storageLocationId: f.mainStore.id, kind: "GAIN", quantity: 1, note: "Found behind the wall" });
    expect((await stockForProject(f.ctx.owner, f.project.id))[0].total).toBe(38);
    await expectError(adjustStock(store, f.project.id, { materialId: f.cement.id, storageLocationId: f.mainStore.id, kind: "THEFT_LOSS", quantity: 500, note: "missing" }), /Only 38/);
  });

  it("invoices need a receipt, stay within the PO value and can't repeat; payments can't exceed what is owed", async () => {
    const s = await setup();
    const { f, store, accounts } = s;
    const { poId } = await toPurchaseOrder(s);
    const line = (await getPurchaseOrder(store, poId)).lines[0];
    const inv = (n: string, subtotal: number, tax: number) => createInvoice(accounts, poId, { invoiceNo: n, invoiceDate: "2026-05-20", subtotal, tax });

    await expectError(inv("A-1", 1000, 180), /Nothing has been received/);
    await recordReceipt(store, poId, { storageLocationId: f.mainStore.id, items: [{ poItemId: line.id, quantity: 100 }] });
    await expectError(inv("A-1", 40000, 7200), /more than what is left/); // PO total is 44,840
    const id1 = await inv("A-1", 20000, 3600);
    await expectError(inv("A-1", 1000, 180), /already been entered/);
    await expectError(inv("A-2", 20000, 3600), /more than what is left/); // 23,600 already, 21,240 left
    await inv("A-2", 18000, 3240);

    await expectError(recordPayment(accounts, id1, { amount: 30000, mode: "BANK_TRANSFER" }), /more than|owed|outstanding/i);
    await recordPayment(accounts, id1, { amount: 10000, mode: "BANK_TRANSFER", reference: "UTR1" });
    const { items, totals } = await listPayables(accounts, { projectId: f.project.id });
    const first = items.find((i) => i.id === id1)!;
    expect(first.status).toBe("PARTIALLY_PAID");
    expect(first.outstanding).toBe(13600);
    expect(totals.paid).toBe(10000);
    await recordPayment(accounts, id1, { amount: 13600, mode: "UPI" });
    expect((await listPayables(accounts, { projectId: f.project.id })).items.find((i) => i.id === id1)!.status).toBe("PAID");
    await expectError(recordPayment(accounts, id1, { amount: 1, mode: "CASH" }), /more than|owed|outstanding|already/i);

    // The database refuses paid > total whatever the service does.
    await expect(db.$executeRaw`UPDATE "VendorInvoice" SET "paidAmount" = "invoiceTotal" + 1 WHERE id = ${id1}`).rejects.toThrow();
  });

  it("hides rates, invoices and payables from roles that must not see money", async () => {
    const s = await setup();
    const { f, store, accounts, proc } = s;
    const { poId, prId } = await toPurchaseOrder(s);
    const line = (await getPurchaseOrder(store, poId)).lines[0];
    await recordReceipt(store, poId, { storageLocationId: f.mainStore.id, items: [{ poItemId: line.id, quantity: 100 }] });
    await createInvoice(accounts, poId, { invoiceNo: "H-1", invoiceDate: "2026-05-20", subtotal: 1000, tax: 180 });

    const asStore = JSON.stringify(await getPurchaseOrder(store, poId));
    for (const key of ["unitRate", "poTotal", "poSubtotal", "lineTotal", "invoiceTotal", "paidAmount", "outstanding"]) expect(asStore).not.toContain(`"${key}"`);
    expect((await getPurchaseOrder(store, poId)).invoices).toEqual([]);

    const asProc = await getPurchaseOrder(proc, poId);
    expect(asProc.poTotal).toBe(44840); // Procurement sees PO rates …
    expect(asProc.invoices).toEqual([]); // … but not the money side.
    expect(JSON.stringify(asProc)).not.toContain("invoiceTotal");

    const asPm = await getPurchaseOrder(f.ctx.pm, poId);
    expect(asPm.poTotal).toBe(44840);
    await expectError(getPurchaseOrder(f.ctx.se, poId), /access/i);
    await expectError(getPurchaseRequest(f.ctx.client, prId), /access/i);
    await expectError(listPayables(store), /access/i);
    await expectError(listPayables(proc), /access/i);
    await expectError(getPurchaseOrder(f.ctx.outsiderPm, poId), /access/i);
  });
});
