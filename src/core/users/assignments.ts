import { demoFlag } from "../common";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan } from "../auth/permissions";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";

/** Roles whose project visibility comes from assignments. */
export const ASSIGNABLE_ROLES: readonly Role[] = ["PROJECT_MANAGER", "SITE_ENGINEER", "STORE_KEEPER", "QUALITY_ENGINEER"];

export async function listAssignments(ctx: Ctx, projectId?: string) {
  assertCan(ctx, "read", "assignment");
  return db.projectAssignment.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: { in: [...ctx.projectIds] } }),
    },
    include: { user: { select: { id: true, name: true, role: true } }, project: { select: { id: true, code: true, name: true } } },
    orderBy: [{ project: { code: "asc" } }, { user: { name: "asc" } }],
  });
}

export async function assignableUsers(ctx: Ctx) {
  assertCan(ctx, "read", "assignment");
  return db.user.findMany({
    where: { isActive: true, role: { in: [...ASSIGNABLE_ROLES] } },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

export async function assignUser(ctx: Ctx, input: { userId: string; projectId: string }) {
  assertCan(ctx, "create", "assignment");
  return db.$transaction(async (tx) => {
    const [user, project] = await Promise.all([
      tx.user.findUnique({ where: { id: input.userId } }),
      tx.project.findUnique({ where: { id: input.projectId } }),
    ]);
    if (!project) throw notFound("That project");
    if (!user || !user.isActive) throw validation("Pick an active user.");
    if (!ASSIGNABLE_ROLES.includes(user.role)) {
      throw validation(`${user.name} is a ${user.role.replace("_", " ").toLowerCase()} and doesn't need project assignments — they see projects by role.`);
    }
    const dup = await tx.projectAssignment.findUnique({ where: { userId_projectId: { userId: user.id, projectId: project.id } } });
    if (dup) throw conflict(`${user.name} is already assigned to ${project.name}.`);
    const a = await tx.projectAssignment.create({ data: { userId: user.id, projectId: project.id, createdById: ctx.userId, ...demoFlag() } });
    await writeAudit(tx, ctx, {
      action: "ASSIGN", entity: "ProjectAssignment", entityId: a.id, projectId: project.id,
      after: { userId: user.id, user: user.name, role: user.role },
    });
    return a.id;
  });
}

export async function unassignUser(ctx: Ctx, assignmentId: string) {
  assertCan(ctx, "delete", "assignment");
  return db.$transaction(async (tx) => {
    const a = await tx.projectAssignment.findUnique({ where: { id: assignmentId }, include: { user: true } });
    if (!a) throw notFound("That assignment");
    await tx.projectAssignment.delete({ where: { id: assignmentId } });
    await writeAudit(tx, ctx, {
      action: "UNASSIGN", entity: "ProjectAssignment", entityId: assignmentId, projectId: a.projectId,
      before: { userId: a.userId, user: a.user.name, role: a.user.role },
    });
  });
}
