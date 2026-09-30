import { db } from "@/lib/db";
import { assertCan } from "../auth/permissions";
import { availableByMaterial } from "../inventory/stock";
import type { Ctx } from "../types";

/** Everything the Site Engineer's request form needs, per assigned active project. */
export async function requestFormData(ctx: Ctx) {
  assertCan(ctx, "create", "material_request");
  const projects = await db.project.findMany({
    where: { status: { in: ["ACTIVE", "DELAYED"] }, ...(ctx.allProjects ? {} : { id: { in: [...ctx.projectIds] } }) },
    select: { id: true, code: true, name: true, activities: { where: { status: { not: "COMPLETED" } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } } },
    orderBy: { code: "asc" },
  });
  const materials = await db.material.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, uom: { select: { code: true } } }, orderBy: { name: "asc" } });
  return Promise.all(
    projects.map(async (p) => {
      const stock = await availableByMaterial(p.id);
      return {
        id: p.id, code: p.code, name: p.name, activities: p.activities,
        materials: materials.map((m) => ({ id: m.id, name: m.name, unit: m.uom.code, inStock: Math.round((stock.get(m.id) ?? 0) * 1000) / 1000 })),
      };
    }),
  );
}

export async function vendorOptions(ctx: Ctx) {
  assertCan(ctx, "read", "vendor");
  const v = await db.vendor.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } });
  return v.map((x) => ({ value: x.id, label: `${x.name} · ${x.category}` }));
}

/** Storage locations of the given projects, as picker options grouped by project id. */
export async function locationOptions(projectIds: string[]) {
  const rows = await db.storageLocation.findMany({ where: { projectId: { in: projectIds } }, select: { id: true, name: true, kind: true, projectId: true }, orderBy: { name: "asc" } });
  const by = new Map<string, { value: string; label: string }[]>();
  for (const r of rows.sort((a, b) => (a.kind === "MAIN_STORE" ? -1 : 0) - (b.kind === "MAIN_STORE" ? -1 : 0))) {
    by.set(r.projectId, [...(by.get(r.projectId) ?? []), { value: r.id, label: r.name }]);
  }
  return by;
}

/** Data for the Store Keeper's issue / return / transfer / count forms on one project. */
export async function stockOpsData(ctx: Ctx, projectId: string, otherProjects: { id: string; code: string; name: string }[]) {
  assertCan(ctx, "create", "inventory", projectId);
  const [materials, activities, locs, stock] = await Promise.all([
    db.material.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, uom: { select: { code: true } } }, orderBy: { name: "asc" } }),
    db.activity.findMany({ where: { projectId }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    locationOptions([projectId, ...otherProjects.map((p) => p.id)]),
    availableByMaterial(projectId),
  ]);
  return {
    projectId,
    materials: materials.map((m) => ({ value: m.id, label: m.name, unit: m.uom.code, inStock: Math.round((stock.get(m.id) ?? 0) * 1000) / 1000 })),
    activities: activities.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
    locations: locs.get(projectId) ?? [],
    otherProjects: otherProjects.map((p) => ({ id: p.id, label: `${p.code} ${p.name}`, locations: locs.get(p.id) ?? [] })),
  };
}
