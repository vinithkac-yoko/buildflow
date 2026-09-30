/**
 * Demo procurement: documents caught at every stage of Flow B, so each role has something to click on the first login.
 * Everything goes through the same helpers the services use (codes, ledger posting), so balances and totals stay consistent.
 */
import type { PaymentMode, Prisma } from "@prisma/client";
import { addDays } from "../dates";
import { nextCode } from "../common";
import { postLedger } from "../inventory/stock";
import { lineAmounts } from "../procurement/orders";

type Tx = Prisma.TransactionClient;

export interface ProcurementSeedInput {
  today: Date;
  now: Date;
  ownerId: string;
  userIds: Map<string, string>;
  materialIds: Map<string, string>;
  projects: { index: number; id: string; pmEmail: string; engineerEmail: string | null; mainStoreId: string }[];
}

const money = (n: number) => Math.round(n * 100) / 100;
type Line = { material: string; qty: number; rate: number; tax?: number };

/** Story per project index (1-based as in PROJECTS). Ages are days before today. */
export async function seedProcurement(tx: Tx, input: ProcurementSeedInput) {
  const vendors = new Map((await tx.vendor.findMany({ where: { isDemo: true }, select: { id: true, name: true } })).map((v) => [v.name, v.id]));
  const vid = (n: string) => vendors.get(n)!;
  const mid = (n: string) => input.materialIds.get(n)!;
  const user = (e: string) => input.userIds.get(e)!;
  const procurementId = user("procurement@buildflow.demo");
  const storeId = user("store@buildflow.demo");
  const accountsId = user("accounts@buildflow.demo");
  const at = (daysAgo: number) => addDays(input.today, -daysAgo);
  const ctxFor = (userId: string, daysAgo = 0) => ({ userId, now: new Date(input.now.getTime() - daysAgo * 86_400_000) });
  const proj = (i: number) => input.projects.find((p) => p.index === i)!;

  async function materialRequest(p: ReturnType<typeof proj>, items: Line[], o: { daysAgo: number; neededInDays: number | null; note?: string; status?: "SUBMITTED" | "CONVERTED" }) {
    const requester = user(p.engineerEmail ?? p.pmEmail);
    const created = new Date(input.now.getTime() - o.daysAgo * 86_400_000);
    const status = o.status ?? "SUBMITTED";
    return tx.materialRequest.create({
      data: {
        code: await nextCode(tx, "MR"), projectId: p.id, requestedById: requester, neededBy: o.neededInDays === null ? null : addDays(input.today, o.neededInDays), note: o.note ?? null,
        status, decidedById: status === "CONVERTED" ? user(p.pmEmail) : null, decidedAt: status === "CONVERTED" ? created : null, createdAt: created, isDemo: true,
        items: { create: items.map((i) => ({ materialId: mid(i.material), quantity: i.qty })) },
      },
    });
  }

  /** MR (converted) → PR → quotations (rates per vendor) → optional PO. Returns ids for what follows. */
  async function chain(p: ReturnType<typeof proj>, items: Line[], o: {
    daysAgo: number; quotes: { vendor: string; rates: number[]; days: number; terms?: string }[]; choose?: number; orderDaysAgo?: number;
  }) {
    const mr = await materialRequest(p, items, { daysAgo: o.daysAgo, neededInDays: 5, status: "CONVERTED" });
    const created = new Date(input.now.getTime() - (o.daysAgo - 0.1) * 86_400_000);
    const pr = await tx.purchaseRequest.create({
      data: {
        code: await nextCode(tx, "PR"), projectId: p.id, materialRequestId: mr.id, raisedById: user(p.pmEmail), neededBy: addDays(input.today, 5),
        status: o.choose === undefined ? "OPEN" : "ORDERED", createdAt: created, isDemo: true,
        items: { create: items.map((i) => ({ materialId: mid(i.material), quantity: i.qty })) },
      },
      include: { items: true },
    });
    const quotes: { id: string; vendor: string; rates: number[] }[] = [];
    for (const q of o.quotes) {
      const row = await tx.vendorQuotation.create({
        data: {
          code: await nextCode(tx, "QTN"), purchaseRequestId: pr.id, vendorId: vid(q.vendor), quoteRef: `Q/${100 + quotes.length * 7 + p.index}`,
          quotedOn: at(o.daysAgo - 1), validUntil: addDays(input.today, 14), deliveryDays: q.days, paymentTerms: q.terms ?? "30 days from delivery",
          status: o.choose === undefined ? "RECEIVED" : quotes.length === o.choose ? "SELECTED" : "NOT_SELECTED", enteredById: procurementId, isDemo: true,
          items: { create: items.map((i, k) => ({ prItemId: pr.items.find((x) => x.materialId === mid(i.material))!.id, unitRate: q.rates[k], taxPct: i.tax ?? 18 })) },
        },
      });
      quotes.push({ id: row.id, vendor: q.vendor, rates: q.rates });
    }
    if (o.choose === undefined) return { pr, po: null as null };

    const sel = o.quotes[o.choose];
    const amounts = items.map((i, k) => lineAmounts(i.qty, sel.rates[k], i.tax ?? 18));
    const subtotal = money(amounts.reduce((s, a) => s + a.subtotal, 0));
    const tax = money(amounts.reduce((s, a) => s + a.tax, 0));
    const year = input.now.getUTCFullYear();
    const orderDaysAgo = o.orderDaysAgo ?? o.daysAgo - 1;
    const po = await tx.purchaseOrder.create({
      data: {
        code: await nextCode(tx, `PO-${year}`, { key: `PO:${year}` }), projectId: p.id, vendorId: vid(sel.vendor), purchaseRequestId: pr.id, quotationId: quotes[o.choose].id,
        orderDate: at(orderDaysAgo), expectedDate: addDays(at(orderDaysAgo), sel.days), terms: sel.terms ?? "30 days from delivery",
        poSubtotal: subtotal, poTax: tax, poTotal: money(subtotal + tax), raisedById: procurementId, createdAt: new Date(input.now.getTime() - orderDaysAgo * 86_400_000), isDemo: true,
        items: { create: items.map((i, k) => ({ materialId: mid(i.material), quantity: i.qty, unitRate: sel.rates[k], taxPct: i.tax ?? 18 })) },
      },
      include: { items: true },
    });
    return { pr, po, poTotal: money(subtotal + tax), lines: items.map((i, k) => ({ ...i, rate: sel.rates[k], poItemId: po.items.find((x) => x.materialId === mid(i.material))!.id })) };
  }

  async function receive(p: ReturnType<typeof proj>, po: { id: string; code: string }, lines: { material: string; qty: number; rate: number; poItemId: string }[], daysAgo: number, challan: string) {
    const ctx = ctxFor(storeId, daysAgo);
    const code = await nextCode(tx, "GRN");
    const receipt = await tx.materialReceipt.create({
      data: {
        code, orderId: po.id, projectId: p.id, storageLocationId: p.mainStoreId, receivedOn: at(daysAgo), challanNo: challan, receivedById: storeId, createdAt: ctx.now, isDemo: true,
        items: { create: lines.map((l) => ({ poItemId: l.poItemId, materialId: mid(l.material), quantity: l.qty })) },
      },
    });
    for (const l of lines) {
      await tx.purchaseOrderItem.update({ where: { id: l.poItemId }, data: { receivedQty: { increment: l.qty } } });
      await postLedger(tx, ctx, {
        projectId: p.id, storageLocationId: p.mainStoreId, materialId: mid(l.material), type: "PO_RECEIPT", quantity: l.qty, unitCost: l.rate,
        refType: "PurchaseOrder", refId: po.id, note: `${po.code} · ${code} · challan ${challan}`, isDemo: true,
      });
    }
    const after = await tx.purchaseOrderItem.findMany({ where: { orderId: po.id } });
    const complete = after.every((i) => Number(i.receivedQty) >= Number(i.quantity) - 1e-9);
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
    return receipt;
  }

  async function invoice(p: ReturnType<typeof proj>, po: { id: string; vendorId: string }, o: { no: string; daysAgo: number; dueInDays: number; subtotal: number; tax: number; paid?: { amount: number; daysAgo: number; mode: PaymentMode; ref: string }[] }) {
    const total = money(o.subtotal + o.tax);
    const paid = money((o.paid ?? []).reduce((s, x) => s + x.amount, 0));
    const inv = await tx.vendorInvoice.create({
      data: {
        code: await nextCode(tx, "VI"), orderId: po.id, projectId: p.id, vendorId: po.vendorId, invoiceNo: o.no, invoiceDate: at(o.daysAgo), dueDate: addDays(at(o.daysAgo), o.dueInDays),
        invoiceSubtotal: o.subtotal, invoiceTax: o.tax, invoiceTotal: total, paidAmount: paid, status: paid <= 0 ? "UNPAID" : paid >= total - 0.001 ? "PAID" : "PARTIALLY_PAID",
        enteredById: accountsId, createdAt: new Date(input.now.getTime() - o.daysAgo * 86_400_000), isDemo: true,
      },
    });
    for (const x of o.paid ?? []) {
      await tx.vendorPayment.create({
        data: { code: await nextCode(tx, "PAY"), invoiceId: inv.id, projectId: p.id, paidOn: at(x.daysAgo), paymentAmount: x.amount, mode: x.mode, reference: x.ref, paidById: accountsId, createdAt: new Date(input.now.getTime() - x.daysAgo * 86_400_000), isDemo: true },
      });
    }
    return inv;
  }

  // 1 · RS Puram — the engineer/PM/procurement demo: a request waiting for the PM, and a purchase request with no quotations yet.
  await materialRequest(proj(1), [{ material: "Cement OPC 53", qty: 300, rate: 0 }, { material: "Binding wire", qty: 40, rate: 0 }], { daysAgo: 0, neededInDays: 2, note: "Slab pour on Thursday" });
  await chain(proj(1), [{ material: "TMT Fe550D 12mm", qty: 2000, rate: 0 }, { material: "TMT Fe550D 16mm", qty: 1500, rate: 0 }], { daysAgo: 1, quotes: [] });

  // 4 · Race Course — a purchase request with one quotation in (Procurement adds a second, then chooses).
  await chain(proj(4), [{ material: "Vitrified tile 800x800", qty: 220, rate: 0 }, { material: "Tile adhesive", qty: 60, rate: 0 }], {
    daysAgo: 2, quotes: [{ vendor: "Salem Marble & Tiles House", rates: [1480, 425], days: 6 }],
  });

  // 7 · Vadavalli — paint is low; an order is out and nothing has arrived yet.
  const paint = await chain(proj(7), [{ material: "Premium emulsion paint", qty: 400, rate: 0 }], {
    daysAgo: 4, choose: 1, orderDaysAgo: 2,
    quotes: [{ vendor: "Salem Marble & Tiles House", rates: [655], days: 9 }, { vendor: "Cauvery Paints & Finishes", rates: [615], days: 4, terms: "15 days from delivery" }],
  });
  void paint;

  // 3 · Saravanampatti — a tile order that arrived in two parts; the invoice for what has come is unpaid.
  const tile = await chain(proj(3), [{ material: "Vitrified tile 800x800", qty: 300, rate: 0 }, { material: "Tile adhesive", qty: 80, rate: 0 }], {
    daysAgo: 12, choose: 0, orderDaysAgo: 10,
    quotes: [{ vendor: "Salem Marble & Tiles House", rates: [1460, 418], days: 5 }, { vendor: "Coimbatore Blocks & Bricks Co", rates: [1495, 430], days: 7 }],
  });
  if (tile.po) {
    const first = [{ material: "Vitrified tile 800x800", qty: 180, rate: tile.lines[0].rate, poItemId: tile.lines[0].poItemId }, { material: "Tile adhesive", qty: 80, rate: tile.lines[1].rate, poItemId: tile.lines[1].poItemId }];
    await receive(proj(3), tile.po, first, 4, "DC-2214");
    const sub = money(180 * tile.lines[0].rate + 80 * tile.lines[1].rate);
    await invoice(proj(3), tile.po, { no: "SMT/2291", daysAgo: 3, dueInDays: 30, subtotal: sub, tax: money(sub * 0.18) });
  }

  // 5 · Peelamedu — cement and sand fully received; invoice half paid.
  const cem = await chain(proj(5), [{ material: "Cement OPC 53", qty: 600, rate: 0 }, { material: "M-sand", qty: 40, rate: 0 }], {
    daysAgo: 20, choose: 0, orderDaysAgo: 18,
    quotes: [{ vendor: "Kovai Cement & Steel Depot", rates: [382, 1440], days: 3 }, { vendor: "Sri Murugan Sand & Aggregates", rates: [390, 1400], days: 4 }],
  });
  if (cem.po) {
    await receive(proj(5), cem.po, cem.lines, 14, "DC-0871");
    const sub = money(600 * cem.lines[0].rate + 40 * cem.lines[1].rate);
    const tax = money(sub * 0.18);
    await invoice(proj(5), cem.po, { no: "KCS/8842", daysAgo: 13, dueInDays: 30, subtotal: sub, tax, paid: [{ amount: money((sub + tax) / 2), daysAgo: 6, mode: "BANK_TRANSFER", ref: "UTR 4471 2210 98" }] });
  }

  // 2 · Tiruppur — an old invoice that is overdue and unpaid (the payables screen shows it in red).
  const blocks = await chain(proj(2), [{ material: "AAC block 200mm", qty: 3000, rate: 0 }], {
    daysAgo: 55, choose: 0, orderDaysAgo: 52,
    quotes: [{ vendor: "Coimbatore Blocks & Bricks Co", rates: [61], days: 5 }, { vendor: "Sri Murugan Sand & Aggregates", rates: [64], days: 6 }],
  });
  if (blocks.po) {
    await receive(proj(2), blocks.po, blocks.lines, 46, "DC-3390");
    const sub = money(3000 * blocks.lines[0].rate);
    await invoice(proj(2), blocks.po, { no: "CBB/5520", daysAgo: 45, dueInDays: 30, subtotal: sub, tax: money(sub * 0.18) });
  }
}
