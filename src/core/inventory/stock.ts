import { randomUUID } from "node:crypto";
import type { LedgerType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, redact } from "../auth/permissions";
import { conflict } from "../errors";
import type { Ctx } from "../types";

type Tx = Prisma.TransactionClient;

/** Ledger types that add stock; every other type removes it. */
export const INBOUND: readonly LedgerType[] = ["OPENING_STOCK", "PO_RECEIPT", "TRANSFER_IN", "ACTIVITY_RETURN"];
export const isInbound = (t: LedgerType) => INBOUND.includes(t);

export interface LedgerEntryInput {
  projectId: string;
  storageLocationId: string;
  materialId: string;
  type: LedgerType;
  quantity: number;
  /** Cost per unit for inbound entries (₹). Outbound entries are valued at the running average. */
  unitCost?: number;
  activityId?: string | null;
  dprId?: string | null;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  clientTxnId?: string | null;
  /** Overrides the DEMO_MODE default (the demo seed marks its own rows). */
  isDemo?: boolean;
}

/**
 * Append one ledger row and move the running balance in the same transaction.
 * Outbound entries use a guarded UPDATE so the balance can never go below zero
 * (the CHECK constraint in prisma/invariants.sql is the final guard). Valuation is moving weighted average.
 */
export async function postLedger(tx: Tx, ctx: Pick<Ctx, "userId" | "now">, e: LedgerEntryInput) {
  if (!(e.quantity > 0)) throw conflict("Stock quantity must be more than zero.");
  let unitCost = e.unitCost ?? 0;

  if (isInbound(e.type)) {
    await tx.$executeRaw`
      INSERT INTO "StockBalance" ("id","projectId","storageLocationId","materialId","quantity","avgCost","updatedAt")
      VALUES (${randomUUID()}, ${e.projectId}, ${e.storageLocationId}, ${e.materialId}, ${e.quantity}, ${unitCost}, now())
      ON CONFLICT ("projectId","storageLocationId","materialId") DO UPDATE SET
        "avgCost" = CASE WHEN "StockBalance"."quantity" + EXCLUDED."quantity" = 0 THEN 0
                    ELSE ("StockBalance"."quantity" * "StockBalance"."avgCost" + EXCLUDED."quantity" * EXCLUDED."avgCost")
                         / ("StockBalance"."quantity" + EXCLUDED."quantity") END,
        "quantity" = "StockBalance"."quantity" + EXCLUDED."quantity",
        "updatedAt" = now()`;
  } else {
    const rows = await tx.$queryRaw<{ avgCost: Prisma.Decimal }[]>`
      UPDATE "StockBalance" SET "quantity" = "quantity" - ${e.quantity}, "updatedAt" = now()
      WHERE "projectId" = ${e.projectId} AND "storageLocationId" = ${e.storageLocationId}
        AND "materialId" = ${e.materialId} AND "quantity" >= ${e.quantity}
      RETURNING "avgCost"`;
    if (rows.length === 0) {
      const [mat, loc, bal] = await Promise.all([
        tx.material.findUnique({ where: { id: e.materialId }, select: { name: true, uom: { select: { code: true } } } }),
        tx.storageLocation.findUnique({ where: { id: e.storageLocationId }, select: { name: true } }),
        tx.stockBalance.findUnique({
          where: { projectId_storageLocationId_materialId: { projectId: e.projectId, storageLocationId: e.storageLocationId, materialId: e.materialId } },
        }),
      ]);
      throw conflict(
        `Only ${bal ? bal.quantity.toString() : "0"} ${mat?.uom.code ?? ""} of ${mat?.name ?? "this material"} in ${loc?.name ?? "that location"}. ` +
          `Reduce the quantity or record a receipt first.`,
      );
    }
    unitCost = Number(rows[0].avgCost);
  }

  return tx.inventoryLedger.create({
    data: {
      projectId: e.projectId, storageLocationId: e.storageLocationId, materialId: e.materialId, type: e.type,
      quantity: e.quantity, unitCost, activityId: e.activityId ?? null, dprId: e.dprId ?? null,
      refType: e.refType ?? null, refId: e.refId ?? null, note: e.note ?? null, createdById: ctx.userId,
      clientTxnId: e.clientTxnId ?? null, isDemo: e.isDemo ?? process.env.DEMO_MODE === "true",
    },
  });
}

/** Where stock for a material sits in a project, Main Store first then by name. */
async function balancesFor(tx: Tx, projectId: string, materialId: string) {
  const rows = await tx.stockBalance.findMany({
    where: { projectId, materialId, quantity: { gt: 0 } },
    include: { storageLocation: { select: { name: true, kind: true } } },
  });
  return rows.sort((a, b) => {
    const am = a.storageLocation.kind === "MAIN_STORE" ? 0 : 1;
    const bm = b.storageLocation.kind === "MAIN_STORE" ? 0 : 1;
    return am - bm || a.storageLocation.name.localeCompare(b.storageLocation.name);
  });
}

export interface Shortage {
  materialId: string;
  material: string;
  unit: string;
  needed: number;
  available: number;
  breakdown: string;
}

/** Total needed per material versus what the project holds. Returns the materials that are short. */
export async function findShortages(tx: Tx, projectId: string, needs: ReadonlyMap<string, number>): Promise<Shortage[]> {
  const out: Shortage[] = [];
  for (const [materialId, needed] of needs) {
    const balances = await balancesFor(tx, projectId, materialId);
    const available = balances.reduce((s, b) => s + Number(b.quantity), 0);
    if (available + 1e-9 < needed) {
      const m = await tx.material.findUnique({ where: { id: materialId }, select: { name: true, uom: { select: { code: true } } } });
      out.push({
        materialId, material: m?.name ?? "Material", unit: m?.uom.code ?? "", needed, available,
        breakdown: balances.length ? balances.map((b) => `${b.storageLocation.name} ${b.quantity.toString()}`).join(", ") : "none in stock",
      });
    }
  }
  return out;
}

export const shortageMessage = (s: Shortage[]) =>
  "Not enough stock to approve this report. " +
  s.map((x) => `${x.material}: needs ${fmt(x.needed)} ${x.unit}, only ${fmt(x.available)} in stock (${x.breakdown})`).join("; ") +
  ". Record a receipt or ask the engineer to correct the quantity, then approve again.";

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** Issue material to an activity, taking from the Main Store first and then other locations. */
export async function issueToActivity(
  tx: Tx,
  ctx: Pick<Ctx, "userId" | "now">,
  a: { projectId: string; materialId: string; quantity: number; activityId: string; dprId?: string | null },
) {
  let remaining = a.quantity;
  const balances = await balancesFor(tx, a.projectId, a.materialId);
  let entries = 0;
  for (const b of balances) {
    if (remaining <= 1e-9) break;
    const take = Math.min(remaining, Number(b.quantity));
    await postLedger(tx, ctx, {
      projectId: a.projectId, storageLocationId: b.storageLocationId, materialId: a.materialId, type: "ACTIVITY_ISSUE",
      quantity: take, activityId: a.activityId, dprId: a.dprId,
    });
    remaining -= take;
    entries += 1;
  }
  if (remaining > 1e-9) {
    const [m] = await Promise.all([tx.material.findUnique({ where: { id: a.materialId }, select: { name: true, uom: { select: { code: true } } } })]);
    throw conflict(`Not enough ${m?.name ?? "material"} in stock: short by ${fmt(remaining)} ${m?.uom.code ?? ""}.`);
  }
  return entries;
}

// ── reads ──

export interface StockRow {
  materialId: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  total: number;
  reorderThreshold: number;
  low: boolean;
  locations: { name: string; quantity: number }[];
  avgCost?: string; // valuation — stripped for roles that may not see it
}

/** Project-wise stock by material (only materials that have or had stock in this project). */
export async function stockForProject(ctx: Ctx, projectId: string): Promise<StockRow[]> {
  assertCan(ctx, "read", "inventory", projectId);
  const balances = await db.stockBalance.findMany({
    where: { projectId },
    include: {
      material: { select: { id: true, code: true, name: true, reorderThreshold: true, uom: { select: { code: true } }, category: { select: { name: true } } } },
      storageLocation: { select: { name: true } },
    },
  });
  const byMat = new Map<string, StockRow & { value: number }>();
  for (const b of balances) {
    const row =
      byMat.get(b.materialId) ??
      ({
        materialId: b.materialId, code: b.material.code, name: b.material.name, unit: b.material.uom.code,
        category: b.material.category.name, total: 0, reorderThreshold: Number(b.material.reorderThreshold), low: false,
        locations: [], value: 0,
      } satisfies StockRow & { value: number });
    row.total += Number(b.quantity);
    row.value += Number(b.quantity) * Number(b.avgCost);
    if (Number(b.quantity) > 0) row.locations.push({ name: b.storageLocation.name, quantity: Number(b.quantity) });
    byMat.set(b.materialId, row);
  }
  return [...byMat.values()]
    .map((r) => {
      const { value, ...rest } = r;
      return redact(ctx, { ...rest, projectId, low: r.reorderThreshold > 0 && r.total <= r.reorderThreshold, avgCost: r.total > 0 ? (value / r.total).toFixed(2) : "0" }, projectId);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Quantity of each material available in a project (all locations). Used by the DPR to show stock at entry. */
export async function availableByMaterial(projectId: string): Promise<Map<string, number>> {
  const rows = await db.stockBalance.groupBy({ by: ["materialId"], where: { projectId }, _sum: { quantity: true } });
  return new Map(rows.map((r) => [r.materialId, Number(r._sum.quantity ?? 0)]));
}
