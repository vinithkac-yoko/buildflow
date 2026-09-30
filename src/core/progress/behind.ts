import { db } from "@/lib/db";
import { assertCan } from "../auth/permissions";
import { dateKey, istToday } from "../dates";
import type { Ctx } from "../types";
import { actualFraction, plannedFraction } from "./calc";

export interface BehindActivity {
  projectId: string;
  projectCode: string;
  projectName: string;
  activityId: string;
  activityCode: string;
  activityName: string;
  criticalPath: boolean;
  plannedPct: number;
  actualPct: number;
  /** Points behind plan (planned % minus actual %). */
  behindPoints: number;
  plannedFinish: string;
}

/**
 * Open activities that should be further along than they are, worst first (critical path breaks ties).
 * Percentages only — no money — so it is safe for every role that may read the dashboard.
 */
export async function behindActivities(ctx: Ctx, opts: { minBehindPoints?: number } = {}): Promise<BehindActivity[]> {
  assertCan(ctx, "read", "dashboard");
  const min = opts.minBehindPoints ?? 15;
  const today = istToday(ctx.now);
  const rows = await db.activity.findMany({
    where: {
      status: { not: "COMPLETED" },
      project: { status: { in: ["ACTIVE", "DELAYED"] }, ...(ctx.allProjects ? {} : { id: { in: [...ctx.projectIds] } }) },
    },
    select: {
      id: true, code: true, name: true, criticalPath: true, plannedQty: true, actualQty: true, plannedStart: true, plannedFinish: true,
      project: { select: { id: true, code: true, name: true } },
    },
  });
  return rows
    .map((a) => {
      const planned = plannedFraction({ start: a.plannedStart, finish: a.plannedFinish }, today) * 100;
      const actual = actualFraction({ plannedQty: Number(a.plannedQty), actualQty: Number(a.actualQty) }) * 100;
      return {
        projectId: a.project.id, projectCode: a.project.code, projectName: a.project.name,
        activityId: a.id, activityCode: a.code, activityName: a.name, criticalPath: a.criticalPath,
        plannedPct: Math.round(planned), actualPct: Math.round(actual), behindPoints: Math.round(planned - actual), plannedFinish: dateKey(a.plannedFinish),
      } satisfies BehindActivity;
    })
    .filter((a) => a.behindPoints >= min)
    .sort((x, y) => Number(y.criticalPath) - Number(x.criticalPath) || y.behindPoints - x.behindPoints);
}
