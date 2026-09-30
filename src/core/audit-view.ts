import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCan, redact } from "./auth/permissions";
import type { Ctx } from "./types";

export const auditFilter = z.object({
  projectId: z.string().optional(),
  userId: z.string().optional(),
  entity: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  take: z.number().int().min(1).max(200).default(100),
});
export type AuditFilter = z.infer<typeof auditFilter>;

/** Owner and Admin only. Read-only view of who did what, where and when. */
export async function listAuditLogs(ctx: Ctx, raw: Partial<AuditFilter> = {}) {
  assertCan(ctx, "read", "audit");
  const f = auditFilter.parse(raw);
  const where: Prisma.AuditLogWhereInput = {
    ...(f.projectId ? { projectId: f.projectId } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.from || f.to
      ? {
          createdAt: {
            ...(f.from ? { gte: new Date(f.from) } : {}),
            ...(f.to ? { lt: new Date(new Date(f.to).getTime() + 86400000) } : {}),
          },
        }
      : {}),
  };
  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: f.take,
    include: { user: { select: { name: true, role: true } } },
  });
  const [projects, users, entities] = await Promise.all([
    db.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
  ]);
  // Admin may read the audit trail but must never see cost data inside before/after snapshots.
  const safeRows = rows.map((r) => ({
    ...r,
    before: redact(ctx, r.before, r.projectId ?? undefined),
    after: redact(ctx, r.after, r.projectId ?? undefined),
  }));
  return { rows: safeRows, projects, users, entities: entities.map((e) => e.entity) };
}
