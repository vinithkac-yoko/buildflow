import type { Prisma } from "@prisma/client";
import type { Ctx } from "./types";

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  projectId?: string | null;
  activityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

/**
 * Write an audit row. Must be called with the transaction client of the mutation it describes,
 * so the change and its audit trail commit (or roll back) together.
 */
export async function writeAudit(tx: Prisma.TransactionClient, ctx: Pick<Ctx, "userId" | "now">, entry: AuditEntry) {
  await tx.auditLog.create({
    data: {
      userId: ctx.userId,
      projectId: entry.projectId ?? null,
      activityId: entry.activityId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      createdAt: ctx.now,
    },
  });
}
