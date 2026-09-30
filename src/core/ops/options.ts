import { db } from "@/lib/db";
import type { Ctx } from "../types";

/** Active projects the caller can act on, each with its activities: for the pickers on the issues, delays, equipment and work-order forms. */
export async function projectsWithActivities(ctx: Ctx) {
  const rows = await db.project.findMany({
    where: { status: { in: ["ACTIVE", "DELAYED"] }, ...(ctx.allProjects ? {} : { id: { in: [...ctx.projectIds] } }) },
    select: { id: true, code: true, name: true, activities: { select: { id: true, code: true, name: true, uom: { select: { code: true } } }, orderBy: { code: "asc" } } },
    orderBy: { code: "asc" },
  });
  return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, activities: p.activities.map((a) => ({ id: a.id, name: `${a.code} ${a.name}`, unit: a.uom.code })) }));
}
export type ProjectsWithActivities = Awaited<ReturnType<typeof projectsWithActivities>>;

export async function activeSubcontractors() {
  const rows = await db.subcontractor.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, trade: { select: { name: true } } }, orderBy: { name: "asc" } });
  return rows.map((s) => ({ value: s.id, label: `${s.name} · ${s.trade.name}` }));
}
