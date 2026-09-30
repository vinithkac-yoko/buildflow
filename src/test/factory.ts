import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { buildCtx } from "@/core/auth/ctx";
import { postLedger } from "@/core/inventory/stock";
import type { Ctx } from "@/core/types";
import { db } from "@/lib/db";

export const hasDb = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL !== "");

/** A self-contained project with users, activities and stock, using unique codes so tests never collide. */
export async function makeFixture(opts: { cementMain?: number; cementYard?: number } = {}) {
  const u = randomUUID().slice(0, 8);
  const uom = await db.uom.create({ data: { code: `t${u}`, name: `Test unit ${u}` } });
  const trade = await db.trade.create({ data: { name: `Test trade ${u}` } });
  const cat = await db.materialCategory.create({ data: { name: `Test category ${u}` } });
  const cement = await db.material.create({ data: { code: `TM-${u}-1`, name: `Test cement ${u}`, categoryId: cat.id, uomId: uom.id, standardUnitCost: 400, reorderThreshold: 10 } });
  const sand = await db.material.create({ data: { code: `TM-${u}-2`, name: `Test sand ${u}`, categoryId: cat.id, uomId: uom.id, standardUnitCost: 50, reorderThreshold: 0 } });
  const client = await db.client.create({ data: { code: `TC-${u}`, name: `Test client ${u}` } });
  const day = new Date(Date.UTC(2026, 0, 1));
  const project = await db.project.create({
    data: {
      code: `TP-${u}`, clientId: client.id, name: `Test project ${u}`, location: "Test", contractValue: 10_000_000,
      baselineStart: day, baselineFinish: new Date(Date.UTC(2027, 0, 1)), currentFinish: new Date(Date.UTC(2027, 0, 1)), status: "ACTIVE",
    },
  });
  const mainStore = await db.storageLocation.create({ data: { projectId: project.id, name: "Main Store", kind: "MAIN_STORE" } });
  const yard = await db.storageLocation.create({ data: { projectId: project.id, name: "Yard", kind: "YARD" } });
  const wbs = await db.wbsNode.create({ data: { projectId: project.id, code: "1", name: "Foundation", seq: 1 } });
  const mkAct = (n: number, cost: number, qty: number) =>
    db.activity.create({
      data: {
        code: `ACT-00${n}`, projectId: project.id, wbsNodeId: wbs.id, uomId: uom.id, tradeId: trade.id, name: `Test activity ${n}`,
        plannedQty: qty, plannedStart: new Date(Date.UTC(2026, 0, 1)), plannedFinish: new Date(Date.UTC(2026, 11, 1)),
        plannedMandays: 50, plannedCost: cost,
      },
    });
  const actA = await mkAct(1, 100_000, 100);
  const actB = await mkAct(2, 50_000, 40);

  let seq = 0;
  const mkUser = async (role: Role, assign = true) => {
    const user = await db.user.create({ data: { email: `${role.toLowerCase()}${++seq}-${u}@test.local`, name: `${role} ${u}`, passwordHash: "x", role } });
    if (assign) await db.projectAssignment.create({ data: { userId: user.id, projectId: project.id } });
    return user;
  };
  const [se, pm, se2] = [await mkUser("SITE_ENGINEER"), await mkUser("PROJECT_MANAGER"), await mkUser("SITE_ENGINEER")];
  const owner = await mkUser("OWNER", false);
  const outsiderPm = await mkUser("PROJECT_MANAGER", false);
  const client_ = await db.user.create({ data: { email: `client-${u}@test.local`, name: `Client ${u}`, passwordHash: "x", role: "CLIENT", clientId: client.id } });

  const now = new Date("2026-05-20T05:00:00Z"); // 10:30 IST, report date 2026-05-20
  const ctxFor = (user: { id: string; role: Role; clientId: string | null }, at: Date = now): Promise<Ctx> => buildCtx(user, at);
  const ctx = {
    se: await ctxFor(se), se2: await ctxFor(se2), pm: await ctxFor(pm), owner: await ctxFor(owner),
    outsiderPm: await ctxFor(outsiderPm), client: await ctxFor(client_),
  };

  const systemCtx = { userId: owner.id, now };
  await db.$transaction(async (tx) => {
    await postLedger(tx, systemCtx, { projectId: project.id, storageLocationId: mainStore.id, materialId: cement.id, type: "OPENING_STOCK", quantity: opts.cementMain ?? 100, unitCost: 400 });
    if ((opts.cementYard ?? 20) > 0)
      await postLedger(tx, systemCtx, { projectId: project.id, storageLocationId: yard.id, materialId: cement.id, type: "OPENING_STOCK", quantity: opts.cementYard ?? 20, unitCost: 420 });
  });

  return { u, uom, trade, cement, sand, project, mainStore, yard, actA, actB, users: { se, pm, se2, owner }, ctx, now };
}
export type Fixture = Awaited<ReturnType<typeof makeFixture>>;

/** Remove everything a fixture created (the ledger is append-only, so deletion needs the explicit switch). */
export async function cleanupFixture(f: Fixture) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('bf.allow_ledger_delete', 'on', true)`;
    await tx.auditLog.deleteMany({ where: { OR: [{ projectId: f.project.id }, { userId: { in: Object.values(f.users).map((x) => x.id) } }] } });
    await tx.project.delete({ where: { id: f.project.id } });
    await tx.user.deleteMany({ where: { email: { endsWith: `-${f.u}@test.local` } } });
    await tx.client.delete({ where: { id: f.project.clientId } });
    await tx.material.deleteMany({ where: { id: { in: [f.cement.id, f.sand.id] } } });
    await tx.materialCategory.deleteMany({ where: { id: f.cement.categoryId } });
    await tx.trade.delete({ where: { id: f.trade.id } });
    await tx.uom.delete({ where: { id: f.uom.id } });
  });
}
