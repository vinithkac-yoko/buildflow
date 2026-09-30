import { db } from "@/lib/db";
import { assertCan } from "../auth/permissions";
import type { Ctx } from "../types";

export interface LowStockItem {
  projectId: string;
  projectCode: string;
  projectName: string;
  materialId: string;
  material: string;
  unit: string;
  quantity: number;
  reorderThreshold: number;
}

/** Materials at or below their reorder level in live projects, summed across storage locations. Quantities only — no valuation. */
export async function lowStockItems(ctx: Ctx): Promise<LowStockItem[]> {
  assertCan(ctx, "read", "inventory");
  const rows = await db.stockBalance.findMany({
    where: {
      project: { status: { in: ["ACTIVE", "DELAYED"] }, ...(ctx.allProjects ? {} : { id: { in: [...ctx.projectIds] } }) },
      material: { reorderThreshold: { gt: 0 } },
    },
    select: {
      quantity: true, projectId: true, materialId: true,
      project: { select: { code: true, name: true } },
      material: { select: { name: true, reorderThreshold: true, uom: { select: { code: true } } } },
    },
  });
  const totals = new Map<string, LowStockItem>();
  for (const r of rows) {
    const key = `${r.projectId}|${r.materialId}`;
    const t = totals.get(key) ?? {
      projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, materialId: r.materialId,
      material: r.material.name, unit: r.material.uom.code, quantity: 0, reorderThreshold: Number(r.material.reorderThreshold),
    };
    t.quantity += Number(r.quantity);
    totals.set(key, t);
  }
  return [...totals.values()]
    .filter((t) => t.quantity <= t.reorderThreshold)
    .map((t) => ({ ...t, quantity: Math.round(t.quantity * 100) / 100 }))
    .sort((a, b) => a.quantity / a.reorderThreshold - b.quantity / b.reorderThreshold);
}
