import type { IssueSeverity, IssueStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan } from "../auth/permissions";
import { dateKey } from "../dates";
import { conflict, notFound } from "../errors";
import type { Ctx } from "../types";

/** Issue life-cycle: raised → in progress → resolved → closed, and reopening if it comes back. */
export const ISSUE_TRANSITIONS: Record<IssueStatus, readonly IssueStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["OPEN", "RESOLVED"],
  RESOLVED: ["CLOSED", "OPEN"],
  CLOSED: ["OPEN"],
};
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" };
export const canTransitionIssue = (from: IssueStatus, to: IssueStatus) => from === to || ISSUE_TRANSITIONS[from].includes(to);

const RANK: Record<IssueSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export async function listIssues(ctx: Ctx, f: { projectId?: string; status?: IssueStatus | "ACTIVE"; severity?: IssueSeverity } = {}) {
  assertCan(ctx, "read", "issue");
  const rows = await db.issue.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ? f.projectId : { in: [...ctx.projectIds] } }),
      ...(f.status === "ACTIVE" ? { status: { in: ["OPEN", "IN_PROGRESS"] as IssueStatus[] } } : f.status ? { status: f.status } : {}),
      ...(f.severity ? { severity: f.severity } : {}),
    },
    include: {
      project: { select: { code: true, name: true } }, activity: { select: { code: true, name: true } }, reportedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const allowed = new Set(ctx.projectIds);
  return rows
    .filter((r) => ctx.allProjects || allowed.has(r.projectId))
    .map((r) => ({
      id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, title: r.title, description: r.description, severity: r.severity, status: r.status,
      activity: r.activity ? `${r.activity.code} ${r.activity.name}` : null, reportedBy: r.reportedBy.name, createdAt: r.createdAt.toISOString(),
      target: r.targetResolutionDate ? dateKey(r.targetResolutionDate) : null, resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.createdAt.localeCompare(a.createdAt));
}

export async function updateIssueStatus(ctx: Ctx, issueId: string, to: IssueStatus) {
  return db.$transaction(async (tx) => {
    const i = await tx.issue.findUnique({ where: { id: issueId } });
    if (!i) throw notFound("That issue");
    assertCan(ctx, "update", "issue", i.projectId);
    if (!canTransitionIssue(i.status, to)) {
      throw conflict(`A ${ISSUE_STATUS_LABEL[i.status].toLowerCase()} issue can't move to ${ISSUE_STATUS_LABEL[to].toLowerCase()}. Allowed: ${ISSUE_TRANSITIONS[i.status].map((s) => ISSUE_STATUS_LABEL[s].toLowerCase()).join(", ")}.`);
    }
    if (i.status === to) return;
    await tx.issue.update({
      where: { id: issueId },
      data: { status: to, resolvedAt: to === "RESOLVED" || to === "CLOSED" ? (i.resolvedAt ?? ctx.now) : null },
    });
    await writeAudit(tx, ctx, {
      action: "STATUS_CHANGE", entity: "Issue", entityId: issueId, projectId: i.projectId, activityId: i.activityId,
      before: { status: i.status }, after: { status: to },
    });
  });
}

/** The PM sets or changes when an issue should be resolved by. */
export async function setIssueTarget(ctx: Ctx, issueId: string, date: string | null) {
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw conflict("Pick a valid date.");
  return db.$transaction(async (tx) => {
    const i = await tx.issue.findUnique({ where: { id: issueId } });
    if (!i) throw notFound("That issue");
    assertCan(ctx, "update", "issue", i.projectId);
    await tx.issue.update({ where: { id: issueId }, data: { targetResolutionDate: date ? new Date(`${date}T00:00:00.000Z`) : null } });
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: "Issue", entityId: issueId, projectId: i.projectId, activityId: i.activityId,
      before: { target: i.targetResolutionDate ? dateKey(i.targetResolutionDate) : null }, after: { target: date },
    });
  });
}
