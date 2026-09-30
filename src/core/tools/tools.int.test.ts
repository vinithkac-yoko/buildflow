import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError } from "@/core/errors";
import { submitDpr } from "@/core/dpr/service";
import { postLedger } from "@/core/inventory/stock";
import { cleanupFixture, hasDb, makeFixture, type Fixture } from "@/test/factory";
import { ASK_QUESTIONS, TOOLS, activitiesBehindSchedule, labourMandaysThisWeek, lowStock, openNcrs } from ".";

describe("agent-tool read functions", () => {
  it("has one described, schema-backed tool per suggested question", () => {
    expect(TOOLS).toHaveLength(4);
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.name).toMatch(/^[a-z_]+$/);
    }
    expect(new Set(ASK_QUESTIONS.map((q) => q.id)).size).toBe(4);
  });
});

describe.skipIf(!hasDb)("Ask BUILDFlow tools (integration)", () => {
  const fixtures: Fixture[] = [];
  const extraMaterials: string[] = [];
  afterAll(async () => {
    // The fixture's own cleanup does not know about the extra material this test adds, so remove it first.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('bf.allow_ledger_delete', 'on', true)`;
      await tx.inventoryLedger.deleteMany({ where: { materialId: { in: extraMaterials } } });
      await tx.stockBalance.deleteMany({ where: { materialId: { in: extraMaterials } } });
      await tx.material.deleteMany({ where: { id: { in: extraMaterials } } });
    });
    for (const f of fixtures) await cleanupFixture(f);
    await db.$disconnect();
  });

  it("answers from real data, only for the projects the caller may see, and refuses roles without access", async () => {
    const f = await makeFixture();
    fixtures.push(f);

    // A material below its reorder level, plus a day of labour.
    const low = await db.material.create({ data: { code: `TL-${f.u}`, name: `Low bricks ${f.u}`, categoryId: f.cement.categoryId, uomId: f.uom.id, standardUnitCost: 9, reorderThreshold: 50 } });
    extraMaterials.push(low.id);
    await db.$transaction((tx) => postLedger(tx, { userId: f.users.owner.id, now: f.now }, { projectId: f.project.id, storageLocationId: f.mainStore.id, materialId: low.id, type: "OPENING_STOCK", quantity: 3, unitCost: 9 }));
    await submitDpr(f.ctx.se, f.project.id, {
      weather: "SUNNY", noWork: false, progress: [{ activityId: f.actA.id, quantity: 1 }],
      labour: [{ activityId: f.actA.id, source: "CONTRACT_LABOUR", tradeId: f.trade.id, headcount: 5, hours: 8 }], materials: [],
    });

    const behind = await activitiesBehindSchedule.run(f.ctx.pm);
    const mine = behind.rows.filter((r) => r.projectId === f.project.id);
    expect(mine.map((r) => r.activityId).sort()).toEqual([f.actA.id, f.actB.id].sort());
    expect(mine[0].behindPoints).toBeGreaterThanOrEqual(15);

    const stock = (await lowStock.run(f.ctx.pm)).rows.filter((r) => r.projectId === f.project.id);
    expect(stock.map((r) => r.material)).toEqual([low.name]); // cement (120, level 10) is not low
    expect(stock[0]).toMatchObject({ quantity: 3, reorderThreshold: 50 });

    const labour = (await labourMandaysThisWeek.run(f.ctx.pm)).rows.filter((r) => r.projectId === f.project.id);
    expect(labour).toEqual([expect.objectContaining({ mandays: 5, workers: 5, reports: 1 })]);

    await expect(openNcrs.run(f.ctx.pm)).resolves.toHaveProperty("rows");

    // A PM who is not on the project sees none of it; the tools return no money.
    for (const t of [activitiesBehindSchedule, lowStock, labourMandaysThisWeek]) {
      expect((await t.run(f.ctx.outsiderPm)).rows.filter((r) => r.projectId === f.project.id)).toHaveLength(0);
    }
    expect(JSON.stringify(await labourMandaysThisWeek.run(f.ctx.pm))).not.toMatch(/cost|rate|wage/i);

    // Site engineers and clients have no Ask BUILDFlow at all.
    for (const c of [f.ctx.se, f.ctx.client]) {
      await expect(lowStock.run(c)).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === "FORBIDDEN");
    }
  });
});
