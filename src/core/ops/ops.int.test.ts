import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { buildCtx } from "@/core/auth/ctx";
import { db } from "@/lib/db";
import { AppError } from "@/core/errors";
import { makePdf } from "@/core/demo/ops";
import { daysLostBetween, endDelay, listDelays, recordDelay } from "@/core/delays/service";
import { addDocumentVersion, createDocument, decideDocument, getDocument, listDocuments, locateDocumentFile } from "@/core/documents/service";
import { assignEquipment, backInService, getEquipment, logEquipment, releaseEquipment } from "@/core/equipment/service";
import { addIssue } from "@/core/dpr/service";
import { listIssues, setIssueTarget } from "@/core/issues/service";
import { cancelWorkOrder, createSubBill, createWorkOrder, getWorkOrder, listSubBills, recordMeasurement, recordSubPayment } from "@/core/subcontract/service";
import { cleanupFixture, hasDb, makeFixture, type Fixture } from "@/test/factory";

async function expectError(p: Promise<unknown>, re: RegExp) {
  await expect(p).rejects.toSatisfy((e: unknown) => (e instanceof AppError ? re.test(e.message) : false));
}

describe("delay days", () => {
  it("counts both the first and the last day; ongoing runs to today", () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    expect(daysLostBetween(d("2026-05-10"), d("2026-05-12"), d("2026-05-20"))).toBe(3);
    expect(daysLostBetween(d("2026-05-20"), d("2026-05-20"), d("2026-05-20"))).toBe(1);
    expect(daysLostBetween(d("2026-05-18"), null, d("2026-05-20"))).toBe(3);
  });
});

describe.skipIf(!hasDb)("Milestone 6 — issues, delays, equipment, documents, work orders (integration)", () => {
  const fixtures: Fixture[] = [];
  const extra = { equipment: [] as string[], subs: [] as string[], trades: [] as string[] };
  let uploads = "";
  beforeAll(() => { uploads = mkdtempSync(path.join(tmpdir(), "bf-docs-")); process.env.UPLOAD_DIR = uploads; });
  afterAll(async () => {
    for (const f of fixtures) await cleanupFixture(f);
    await db.equipment.deleteMany({ where: { id: { in: extra.equipment } } });
    await db.subcontractor.deleteMany({ where: { id: { in: extra.subs } } });
    await db.trade.deleteMany({ where: { id: { in: extra.trades } } });
    await db.$disconnect();
    rmSync(uploads, { recursive: true, force: true });
  });

  async function setup() {
    const f = await makeFixture();
    fixtures.push(f);
    let n = 0;
    const mk = async (role: Role, assign = false) => {
      const user = await db.user.create({ data: { email: `${role.toLowerCase()}-o${++n}-${f.u}@test.local`, name: `${role} ${f.u}`, passwordHash: "x", role } });
      if (assign) await db.projectAssignment.create({ data: { userId: user.id, projectId: f.project.id } });
      return buildCtx(user, f.now);
    };
    const accounts = await mk("ACCOUNTS");
    const qe = await mk("QUALITY_ENGINEER", true);
    const trade = await db.trade.create({ data: { name: `Ops trade ${f.u}` } });
    extra.trades.push(trade.id);
    const sub = await db.subcontractor.create({ data: { code: `OSUB-${f.u}`, name: `Ops sub ${f.u}`, tradeId: trade.id } });
    extra.subs.push(sub.id);
    const eq = await db.equipment.create({ data: { code: `OEQ-${f.u}`, name: `Ops mixer ${f.u}`, category: "Concrete equipment", ownership: "COMPANY" } });
    extra.equipment.push(eq.id);
    return { f, accounts, qe, sub, eq, mk };
  }

  // ── issues ──
  it("issues carry a description and target date, and the PM can change the date", async () => {
    const { f } = await setup();
    const id = await addIssue(f.ctx.se, f.project.id, { title: "Scaffold tie missing", severity: "HIGH", description: "East side, third lift", targetResolutionDate: "2026-05-25" });
    const row = (await listIssues(f.ctx.pm, { projectId: f.project.id }))[0];
    expect(row.description).toBe("East side, third lift");
    expect(row.target).toBe("2026-05-25");
    await expectError(setIssueTarget(f.ctx.se, id, "2026-05-30"), /access/i);
    await setIssueTarget(f.ctx.pm, id, "2026-05-28");
    expect((await listIssues(f.ctx.pm, { projectId: f.project.id }))[0].target).toBe("2026-05-28");
  });

  // ── delays ──
  it("delays record cause, evidence and a responsible function, count days lost, and hide cost from non-cost roles", async () => {
    const { f } = await setup();
    const base = { category: "MATERIAL_SUPPLY", delayFactor: "Steel arrived late", startDate: "2026-05-10", endDate: "2026-05-13", criticalPathImpact: true, costImpact: 50000, evidence: "Delivery challans", responsibleFunction: "PROCUREMENT", activityId: f.actA.id };
    await expectError(recordDelay(f.ctx.se, f.project.id, base), /access/i);
    await expect(recordDelay(f.ctx.pm, f.project.id, { ...base, responsibleFunction: "Ravi" })).rejects.toThrow(/responsible function/i); // a name, not a function
    await expectError(recordDelay(f.ctx.pm, f.project.id, { ...base, startDate: "2026-06-30", endDate: null }), /future/);
    await expectError(recordDelay(f.ctx.pm, f.project.id, { ...base, endDate: "2026-05-09" }), /before the start/);
    const id = await recordDelay(f.ctx.pm, f.project.id, base);
    const asPm = (await listDelays(f.ctx.pm, { projectId: f.project.id })).find((d) => d.id === id)!;
    expect(asPm.daysLost).toBe(4);
    expect(asPm.costImpact).toBe(50000);
    expect(asPm.ongoing).toBe(false);

    const ongoing = await recordDelay(f.ctx.pm, f.project.id, { ...base, startDate: "2026-05-18", endDate: null, costImpact: null });
    expect((await listDelays(f.ctx.pm, { projectId: f.project.id })).find((d) => d.id === ongoing)!.daysLost).toBe(3); // 18th–20th
    await endDelay(f.ctx.pm, ongoing, "2026-05-19");
    expect((await listDelays(f.ctx.pm, { projectId: f.project.id })).find((d) => d.id === ongoing)!.daysLost).toBe(2);
    await expectError(endDelay(f.ctx.pm, ongoing, "2026-05-20"), /already ended/);
    await expectError(listDelays(f.ctx.se, {}), /access/i);
    await expect(db.$executeRaw`UPDATE "Delay" SET "costImpact" = -1 WHERE id = ${id}`).rejects.toThrow();
  });

  // ── equipment ──
  it("equipment is on one project at a time; usage, breakdown and back-in-service are tracked", async () => {
    const { f, eq } = await setup();
    await expectError(assignEquipment(f.ctx.se, eq.id, { projectId: f.project.id }), /access/i);
    await assignEquipment(f.ctx.pm, eq.id, { projectId: f.project.id, activityId: f.actA.id, fromDate: "2026-05-01" });
    await expectError(assignEquipment(f.ctx.pm, eq.id, { projectId: f.project.id }), /already on/);
    await expect(db.equipmentAssignment.create({ data: { equipmentId: eq.id, projectId: f.project.id, fromDate: new Date("2026-05-01"), assignedById: f.users.pm.id } })).rejects.toThrow(); // one open assignment (index)

    await logEquipment(f.ctx.pm, eq.id, { kind: "USAGE", hours: 8, logDate: "2026-05-19" });
    await expectError(logEquipment(f.ctx.pm, eq.id, { kind: "USAGE", hours: 17, logDate: "2026-05-19" }), /25 hours in one day/);
    await expect(logEquipment(f.ctx.pm, eq.id, { kind: "USAGE", hours: 30, logDate: "2026-05-19" })).rejects.toThrow(/24 hours/);
    await expectError(logEquipment(f.ctx.pm, eq.id, { kind: "BREAKDOWN", logDate: "2026-05-20" }), /what broke down/);
    await logEquipment(f.ctx.pm, eq.id, { kind: "BREAKDOWN", logDate: "2026-05-20", note: "Motor failed" });
    expect((await getEquipment(f.ctx.pm, eq.id)).status).toBe("BREAKDOWN");
    await backInService(f.ctx.pm, eq.id);
    expect((await getEquipment(f.ctx.pm, eq.id)).status).toBe("IN_USE");
    const detail = await getEquipment(f.ctx.pm, eq.id);
    expect(detail.logs.filter((l) => l.kind === "USAGE").reduce((s, l) => s + l.hours, 0)).toBe(8);

    await releaseEquipment(f.ctx.pm, eq.id);
    const after = await getEquipment(f.ctx.pm, eq.id);
    expect(after.status).toBe("AVAILABLE");
    expect(after.current).toBeNull();
    await expectError(logEquipment(f.ctx.pm, eq.id, { kind: "USAGE", hours: 2 }), /isn't assigned/);
  });

  it("broken equipment can't be sent to a site", async () => {
    const { f, eq } = await setup();
    await assignEquipment(f.ctx.pm, eq.id, { projectId: f.project.id });
    await logEquipment(f.ctx.pm, eq.id, { kind: "MAINTENANCE", note: "Greasing" });
    await releaseEquipment(f.ctx.pm, eq.id);
    await expectError(assignEquipment(f.ctx.pm, eq.id, { projectId: f.project.id }), /in maintenance/);
  });

  // ── documents ──
  it("documents: versions supersede, approval resets, clients see only released current versions, files are checked", async () => {
    const { f } = await setup();
    const file = (t: string) => ({ buffer: makePdf(t), name: `${t}.pdf` });
    const docId = await createDocument(f.ctx.pm, f.project.id, { category: "DRAWINGS", title: "Structural drawing" }, file("v1"));
    await expectError(createDocument(f.ctx.se, f.project.id, { category: "DRAWINGS", title: "Nope" }, file("x")), /access/i);
    await expect(createDocument(f.ctx.pm, f.project.id, { category: "DRAWINGS", title: "Script" }, { buffer: Buffer.from("MZ not a pdf"), name: "run.pdf" })).rejects.toThrow(/Only PDF/);
    await expect(createDocument(f.ctx.pm, f.project.id, { category: "DRAWINGS", title: "Renamed" }, { buffer: Buffer.from("plain text"), name: "notes.pdf" })).rejects.toThrow(/Only PDF/);

    // Approve and release: the client sees it.
    await expectError(decideDocument(f.ctx.se, docId, "APPROVE"), /access/i);
    await expectError(decideDocument(f.ctx.pm, docId, "RELEASE"), /isn't possible/);
    await decideDocument(f.ctx.pm, docId, "APPROVE");
    await decideDocument(f.ctx.pm, docId, "RELEASE");
    expect((await listDocuments(f.ctx.client)).map((d) => d.id)).toContain(docId);
    const v1 = (await getDocument(f.ctx.pm, docId)).versions[0].id;

    // A new version supersedes v1 and takes the document back to "waiting for approval" (so the client stops seeing it).
    expect(await addDocumentVersion(f.ctx.pm, docId, file("v2"), "Added section")).toBe(2);
    const doc = await getDocument(f.ctx.pm, docId);
    expect(doc.status).toBe("UPLOADED");
    expect(doc.versions.map((v) => `${v.version}:${v.isCurrent}`)).toEqual(["2:true", "1:false"]);
    expect((await listDocuments(f.ctx.client)).map((d) => d.id)).not.toContain(docId);
    await expect(db.documentVersion.updateMany({ where: { documentId: docId }, data: { isCurrent: true } })).rejects.toThrow(); // only one CURRENT

    // Internal roles can open an old version; a client can only ever get the current version of a released document.
    await expect(locateDocumentFile(f.ctx.pm, v1)).resolves.toBeTruthy();
    await decideDocument(f.ctx.pm, docId, "APPROVE");
    await decideDocument(f.ctx.pm, docId, "RELEASE");
    await expectError(locateDocumentFile(f.ctx.client, v1), /not found/);
    const v2 = (await getDocument(f.ctx.client, docId)).currentVersionId;
    await expect(locateDocumentFile(f.ctx.client, v2)).resolves.toBeTruthy();
    expect((await getDocument(f.ctx.client, docId)).versions).toHaveLength(1);

    // Rejection needs a reason; an outside PM can't see it at all; withdrawing hides it from the client again.
    await decideDocument(f.ctx.pm, docId, "WITHDRAW");
    await expectError(getDocument(f.ctx.client, docId), /not found/);
    await addDocumentVersion(f.ctx.pm, docId, file("v3"));
    await expect(decideDocument(f.ctx.pm, docId, "REJECT", "")).rejects.toThrow(/why it is rejected/);
    await decideDocument(f.ctx.pm, docId, "REJECT", "Wrong scale on sheet 2");
    expect((await getDocument(f.ctx.pm, docId)).statusNote).toContain("Wrong scale");
    await expectError(getDocument(f.ctx.outsiderPm, docId), /not found/);
  });

  // ── work orders ──
  async function workOrder(s: Awaited<ReturnType<typeof setup>>, qty = 100, rate = 50) {
    return createWorkOrder(s.f.ctx.pm, s.f.project.id, { subcontractorId: s.sub.id, title: "Shuttering", items: [{ activityId: s.f.actA.id, quantity: qty, workRate: rate }] });
  }

  it("work order → measurement → bill → payment, with quantity, billing and payment limits", async () => {
    const s = await setup();
    const { f, accounts } = s;
    await expectError(createWorkOrder(f.ctx.se, f.project.id, { subcontractorId: s.sub.id, title: "Nope", items: [{ activityId: f.actA.id, quantity: 1, workRate: 1 }] }), /access/i);
    const woId = await workOrder(s);
    let wo = await getWorkOrder(f.ctx.pm, woId);
    expect(wo.workTotal).toBe(5000);
    const item = wo.items[0];

    await expectError(recordMeasurement(accounts, woId, { itemId: item.id, quantity: 10 }), /access/i); // Accounts doesn't measure
    await recordMeasurement(f.ctx.pm, woId, { itemId: item.id, quantity: 60 });
    await expectError(recordMeasurement(f.ctx.pm, woId, { itemId: item.id, quantity: 50 }), /Only 40 .* left/);
    await expect(db.workOrderItem.update({ where: { id: item.id }, data: { measuredQty: 101 } })).rejects.toThrow(); // database guard

    await expectError(createSubBill(f.ctx.pm, woId, { billNo: "B-1", billDate: "2026-05-20", retentionPct: 5 }), /access/i); // PM can't bill
    const billId = await createSubBill(accounts, woId, { billNo: "B-1", billDate: "2026-05-20", retentionPct: 5 });
    wo = await getWorkOrder(accounts, woId);
    const bill = wo.bills[0];
    expect(bill.billGross).toBe(3000); // 60 × 50
    expect(bill.billRetention).toBe(150);
    expect(bill.billNet).toBe(2850);
    await expectError(createSubBill(accounts, woId, { billNo: "B-2", billDate: "2026-05-20", retentionPct: 5 }), /no measured work/i); // nothing left unbilled

    await recordMeasurement(f.ctx.pm, woId, { itemId: item.id, quantity: 40 });
    expect((await getWorkOrder(f.ctx.pm, woId)).status).toBe("COMPLETED");
    await expectError(createSubBill(accounts, woId, { billNo: "B-1", billDate: "2026-05-21", retentionPct: 5 }), /already been entered/);
    await createSubBill(accounts, woId, { billNo: "B-2", billDate: "2026-05-21", retentionPct: 0 });
    await expectError(recordMeasurement(f.ctx.pm, woId, { itemId: item.id, quantity: 1 }), /no more work/);

    await expectError(recordSubPayment(accounts, billId, { amount: 3000, mode: "CASH" }), /Only ₹2,850/);
    await recordSubPayment(accounts, billId, { amount: 1000, mode: "BANK_TRANSFER", reference: "UTR1" });
    const { items, totals } = await listSubBills(accounts, { projectId: f.project.id });
    expect(items.find((b) => b.id === billId)!.status).toBe("PARTIALLY_PAID");
    expect(totals.outstanding).toBe(1850 + 2000); // B-1 owed 1,850 + B-2 owed 2,000 (40 × 50, no retention)
    await recordSubPayment(accounts, billId, { amount: 1850, mode: "UPI" });
    expect((await listSubBills(accounts, { projectId: f.project.id })).items.find((b) => b.id === billId)!.status).toBe("PAID");
    await expectError(recordSubPayment(accounts, billId, { amount: 1, mode: "CASH" }), /already fully paid/);
    await expect(db.$executeRaw`UPDATE "SubcontractorBill" SET "billPaid" = "billNet" + 1 WHERE id = ${billId}`).rejects.toThrow();
  });

  it("a work order can be cancelled only before any work is measured; money is hidden from other roles", async () => {
    const s = await setup();
    const { f, qe } = s;
    const a = await workOrder(s);
    await expectError(cancelWorkOrder(f.ctx.pm, a, "x"), /Say why/);
    await cancelWorkOrder(f.ctx.pm, a, "Scope moved to another contractor");
    expect((await getWorkOrder(f.ctx.pm, a)).status).toBe("CANCELLED");

    const b = await workOrder(s);
    await recordMeasurement(f.ctx.pm, b, { itemId: (await getWorkOrder(f.ctx.pm, b)).items[0].id, quantity: 5 });
    await expectError(cancelWorkOrder(f.ctx.pm, b, "Changed our mind"), /already has measured work/);

    await expectError(getWorkOrder(f.ctx.se, b), /access/i);
    await expectError(getWorkOrder(qe, b), /access/i);
    await expectError(getWorkOrder(f.ctx.outsiderPm, b), /access/i);
    const asOwner = await getWorkOrder(f.ctx.owner, b);
    expect(asOwner.workTotal).toBe(5000);
  });
});
