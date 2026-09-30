import type { Prisma, ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, redact } from "../auth/permissions";
import { notFound } from "../errors";
import type { Ctx } from "../types";

export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  location: string;
  status: ProjectStatus;
  clientName: string;
  contractValue?: string; // stripped by redact() for roles that may not see it
  baselineFinish: Date;
  currentFinish: Date;
  isDemo: boolean;
}

function scopeWhere(ctx: Ctx): Prisma.ProjectWhereInput {
  return ctx.allProjects ? {} : { id: { in: [...ctx.projectIds] } };
}

/** Projects visible to this user: assigned only for engineers/PMs, own projects for clients. */
export async function listProjects(ctx: Ctx, filter: { status?: ProjectStatus } = {}): Promise<ProjectListItem[]> {
  assertCan(ctx, "read", "project");
  const rows = await db.project.findMany({
    where: { ...scopeWhere(ctx), ...(filter.status ? { status: filter.status } : {}) },
    include: { client: { select: { name: true } } },
    orderBy: { code: "asc" },
  });
  return rows.map((p) =>
    redact(
      ctx,
      {
        id: p.id, code: p.code, name: p.name, location: p.location, status: p.status,
        clientName: p.client.name, contractValue: p.contractValue.toString(),
        baselineFinish: p.baselineFinish, currentFinish: p.currentFinish, isDemo: p.isDemo,
      } satisfies ProjectListItem,
      p.id,
    ),
  );
}

export async function getProject(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "project", projectId);
  const p = await db.project.findUnique({
    where: { id: projectId },
    include: { client: { select: { id: true, name: true, code: true } } },
  });
  if (!p) throw notFound("That project");
  return redact(
    ctx,
    {
      id: p.id, code: p.code, name: p.name, type: p.type, location: p.location, status: p.status,
      contractValue: p.contractValue.toString(), baselineStart: p.baselineStart,
      baselineFinish: p.baselineFinish, currentFinish: p.currentFinish, healthScore: p.healthScore,
      client: p.client, isDemo: p.isDemo,
    },
    p.id,
  );
}
