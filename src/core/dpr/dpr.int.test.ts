import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/core/errors";
import { stockForProject } from "@/core/inventory/stock";
import { cleanupFixture, hasDb, makeFixture, type Fixture } from "@/test/factory";
import { dprDetail, engineerReport } from "./queries";
import { addIssue, approveDpr, ensureDpr, rejectDpr, saveDraft, submitDpr } from "./service";

const payload = (f: Fixture, over: Record<string, unknown> = {}) => ({
  weather: "SUNNY",
  remarks: "Good progress",
  noWork: false,
  progress: [{ activityId: f.actA.id, quantity: 30 }, { activityId: f.actB.id, quantity: 10 }],
  labour: [{ activityId: f.actA.id, source: "CONTRACT_LABOUR", tradeId: f.trade.id, headcount: 6, hours: 8 }],
  materials: [{ activityId: f.actA.id, materialId: f.cement.id, quantity: 50 }],
  ...over,
});

async function expectError(p: Promise<unknown>, re: RegExp) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError ? re.test(e.message) : false);
}

describe.skipIf(!hasDb)("DPR flow (integration)", () => {
  const fixtures: Fixture[] = [];
  const fresh = async (o?: Parameters<typeof makeFixture>[0]) => {
    const f = await makeFixture(o);
    fixtures.push(f);
    return f;
  };
  afterAll(async () => {
    for (const f of fixtures) await cleanupFixture(f);
    await db.$disconnect();
  });

  it("allows only one DPR per project per day (service and database)", async () => {
    const f = await fresh();
    const a = await ensureDpr(f.ctx.se, f.project.id);
    const b = await ensureDpr(f.ctx.se2, f.project.id);
    expect(b.id).toBe(a.id); // second engineer joins the existing draft
    await expect(
      db.dpr.create({ data: { projectId: f.project.id, reportDate: a.reportDate, createdById: f.users.se.id } }),
    ).rejects.toSatisfy((e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002");
  });

  it("approval posts progress, status, mandays and stock in one step", async () => {
    const f = await fresh();
    const res = await submitDpr(f.ctx.se, f.project.id, payload(f));
    expect(res.status).toBe("SUBMITTED");

    // Nothing is posted on submit.
    expect(Number((await db.activity.findUniqueOrThrow({ where: { id: f.actA.id } })).actualQty)).toBe(0);
    expect((await stockForProject(f.ctx.owner, f.project.id))[0].total).toBe(120);

    const summary = await approveDpr(f.ctx.pm, res.dprId);
    expect(summary.activitiesUpdated).toBe(2);
    expect(summary.mandaysPosted).toBe(6);

    const [a, b] = await Promise.all([db.activity.findUniqueOrThrow({ where: { id: f.actA.id } }), db.activity.findUniqueOrThrow({ where: { id: f.actB.id } })]);
    expect(Number(a.actualQty)).toBe(30);
    expect(a.status).toBe("IN_PROGRESS"); // NOT_STARTED → IN_PROGRESS
    expect(Number(a.actualMandays)).toBe(6);
    expect(a.actualStart?.toISOString().slice(0, 10)).toBe("2026-05-20");
    expect(Number(b.actualQty)).toBe(10);

    // 50 bags issued: Main Store first (100 → 50), Yard untouched.
    const stock = (await stockForProject(f.ctx.owner, f.project.id))[0];
    expect(stock.total).toBe(70);
    expect(stock.locations.find((l) => l.name === "Main Store")?.quantity).toBe(50);
    const ledger = await db.inventoryLedger.findMany({ where: { dprId: res.dprId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("ACTIVITY_ISSUE");
    expect(ledger[0].activityId).toBe(f.actA.id);

    const audit = await db.auditLog.findFirst({ where: { entity: "Dpr", entityId: res.dprId, action: "APPROVE" } });
    expect(audit?.userId).toBe(f.users.pm.id);
    expect(audit?.projectId).toBe(f.project.id);
  });

  it("marks an activity COMPLETED once cumulative quantity reaches the plan, and never double-approves", async () => {
    const f = await fresh();
    const r = await submitDpr(f.ctx.se, f.project.id, payload(f, { progress: [{ activityId: f.actB.id, quantity: 40 }], materials: [], labour: [] }));
    await approveDpr(f.ctx.pm, r.dprId);
    const b = await db.activity.findUniqueOrThrow({ where: { id: f.actB.id } });
    expect(b.status).toBe("COMPLETED");
    expect(b.actualFinish?.toISOString().slice(0, 10)).toBe("2026-05-20");
    await expectError(approveDpr(f.ctx.pm, r.dprId), /already approved/i);
    expect(Number((await db.activity.findUniqueOrThrow({ where: { id: f.actB.id } })).actualQty)).toBe(40); // not 80
  });

  it("blocks approval when stock is insufficient and changes nothing", async () => {
    const f = await fresh({ cementMain: 30, cementYard: 10 });
    const r = await submitDpr(f.ctx.se, f.project.id, payload(f)); // needs 50, only 40 exist
    await expectError(approveDpr(f.ctx.pm, r.dprId), /Not enough stock.*needs 50.*only 40/i);
    const dpr = await db.dpr.findUniqueOrThrow({ where: { id: r.dprId } });
    expect(dpr.status).toBe("SUBMITTED");
    expect(Number((await db.activity.findUniqueOrThrow({ where: { id: f.actA.id } })).actualQty)).toBe(0);
    expect((await stockForProject(f.ctx.owner, f.project.id))[0].total).toBe(40);
    expect(await db.inventoryLedger.count({ where: { dprId: r.dprId } })).toBe(0);
    // The PM can see the shortage before trying.
    const detail = await dprDetail(f.ctx.pm, r.dprId);
    expect(detail.shortages[0]).toMatchObject({ needed: 50, available: 40 });
  });

  it("takes material from other locations when the Main Store is short", async () => {
    const f = await fresh({ cementMain: 30, cementYard: 40 });
    const r = await submitDpr(f.ctx.se, f.project.id, payload(f));
    await approveDpr(f.ctx.pm, r.dprId);
    const rows = await db.inventoryLedger.findMany({ where: { dprId: r.dprId }, orderBy: { createdAt: "asc" } });
    expect(rows.map((x) => Number(x.quantity)).sort()).toEqual([20, 30]);
  });

  it("refuses impossible output with a message that says what is left", async () => {
    const f = await fresh();
    await expectError(
      saveDraft(f.ctx.se, f.project.id, payload(f, { progress: [{ activityId: f.actA.id, quantity: 500 }] })),
      /Only 100 .* left on Test activity 1.*planned 100.*done 0/i,
    );
  });

  it("refuses impossible labour hours in the service and in the database", async () => {
    const f = await fresh();
    await expect(
      saveDraft(f.ctx.se, f.project.id, payload(f, { labour: [{ activityId: f.actA.id, source: "CONTRACT_LABOUR", tradeId: f.trade.id, headcount: 5, hours: 20 }] })),
    ).rejects.toThrow(/16/);
    const dpr = await ensureDpr(f.ctx.se, f.project.id);
    await expect(
      db.labourLog.create({ data: { dprId: dpr.id, projectId: f.project.id, source: "COMPANY_EMPLOYEE", tradeId: f.trade.id, headcount: 2, hours: 20, mandays: 5, enteredById: f.users.se.id } }),
    ).rejects.toThrow();
  });

  it("makes negative stock impossible at the database and keeps the ledger append-only", async () => {
    const f = await fresh({ cementMain: 10, cementYard: 0 });
    await expect(
      db.$executeRaw`UPDATE "StockBalance" SET quantity = quantity - 11 WHERE "projectId" = ${f.project.id}`,
    ).rejects.toThrow(/stock_balance_non_negative|check constraint/i);
    await expect(db.$executeRaw`UPDATE "InventoryLedger" SET quantity = 999 WHERE "projectId" = ${f.project.id}`).rejects.toThrow(/append-only/i);
    await expect(db.$executeRaw`DELETE FROM "InventoryLedger" WHERE "projectId" = ${f.project.id}`).rejects.toThrow(/append-only/i);
  });

  it("locks the report after the first submit and lets the PM send it back", async () => {
    const f = await fresh();
    const r = await submitDpr(f.ctx.se, f.project.id, payload(f, { materials: [] }));
    await expectError(saveDraft(f.ctx.se2, f.project.id, payload(f)), /already submitted/i);
    await expectError(submitDpr(f.ctx.se2, f.project.id, payload(f)), /already submitted/i);
    await rejectDpr(f.ctx.pm, r.dprId, "Quantity for activity 1 looks too high");
    const rej = await db.dpr.findUniqueOrThrow({ where: { id: r.dprId } });
    expect(rej.status).toBe("REJECTED");
    expect((await engineerReport(f.ctx.se, f.project.id)).dpr?.rejectionReason).toMatch(/too high/);
    // Editing a rejected report reopens it; resubmit works.
    const saved = await saveDraft(f.ctx.se, f.project.id, payload(f, { materials: [] }));
    expect(saved.status).toBe("DRAFT");
    await submitDpr(f.ctx.se, f.project.id, payload(f, { materials: [] }));
    await approveDpr(f.ctx.pm, r.dprId);
  });

  it("is idempotent: saving the same report twice leaves one set of rows", async () => {
    const f = await fresh();
    await saveDraft(f.ctx.se, f.project.id, payload(f));
    await saveDraft(f.ctx.se, f.project.id, payload(f));
    const dpr = await db.dpr.findFirstOrThrow({ where: { projectId: f.project.id }, include: { progress: true, labour: true, materials: true } });
    expect(dpr.progress).toHaveLength(2);
    expect(dpr.labour).toHaveLength(1);
    expect(dpr.materials).toHaveLength(1);
    expect(await db.dpr.count({ where: { projectId: f.project.id } })).toBe(1);
  });

  it("records an issue once for the same clientTxnId", async () => {
    const f = await fresh();
    const body = { title: "Water logging near footing", severity: "HIGH", clientTxnId: `txn-${f.u}-issue-1` };
    const a = await addIssue(f.ctx.se, f.project.id, body);
    const b = await addIssue(f.ctx.se, f.project.id, body);
    expect(b).toBe(a);
    expect(await db.issue.count({ where: { projectId: f.project.id } })).toBe(1);
  });

  it("enforces roles and project scope", async () => {
    const f = await fresh();
    const r = await submitDpr(f.ctx.se, f.project.id, payload(f, { materials: [] }));
    await expectError(approveDpr(f.ctx.se, r.dprId), /don't have access/i);
    await expectError(approveDpr(f.ctx.outsiderPm, r.dprId), /don't have access/i);
    await expectError(saveDraft(f.ctx.outsiderPm, f.project.id, payload(f)), /don't have access/i);
    await expect(approveDpr(f.ctx.owner, r.dprId)).resolves.toBeTruthy();
  });

  it("never sends cost fields to the engineer or the client", async () => {
    const f = await fresh();
    const r = await submitDpr(f.ctx.se, f.project.id, payload(f));
    const report = JSON.stringify(await engineerReport(f.ctx.se, f.project.id));
    for (const k of ["plannedCost", "dailyLabourCost", "avgCost", "standardUnitCost", "internalBudgetRate", "contractValue"]) expect(report).not.toContain(k);

    const seView = JSON.stringify(await dprDetail(f.ctx.se, r.dprId));
    expect(seView).not.toContain("dailyLabourCost");
    const pmView = JSON.stringify(await dprDetail(f.ctx.pm, r.dprId));
    expect(pmView).toContain("dailyLabourCost");

    await approveDpr(f.ctx.pm, r.dprId);
    const clientView = JSON.stringify(await dprDetail(f.ctx.client, r.dprId));
    expect(clientView).not.toContain("dailyLabourCost");
  });

  it("hides unapproved reports from the client", async () => {
    const f = await fresh();
    const r = await submitDpr(f.ctx.se, f.project.id, payload(f, { materials: [] }));
    await expect(dprDetail(f.ctx.client, r.dprId)).rejects.toBeInstanceOf(AppError);
    await approveDpr(f.ctx.pm, r.dprId);
    await expect(dprDetail(f.ctx.client, r.dprId)).resolves.toBeTruthy();
  });
});
