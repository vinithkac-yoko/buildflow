import { db } from "@/lib/db";
import { assertCan, redact } from "../auth/permissions";
import { addDays, dateKey, istToday } from "../dates";
import type { Ctx } from "../types";

const num = (d: { toString(): string } | number) => Number(d.toString());

/** Labour lines for the labour screen: today only for the site team, the last 7 days for PMs and the Owner. */
export async function labourSummary(ctx: Ctx, opts: { projectId?: string } = {}) {
  assertCan(ctx, "read", "labour");
  const today = istToday(ctx.now);
  const team = ctx.role === "SITE_ENGINEER";
  const rows = await db.labourLog.findMany({
    where: {
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: opts.projectId ? opts.projectId : { in: [...ctx.projectIds] } }),
      dpr: team ? { reportDate: today } : { reportDate: { gt: addDays(today, -7), lte: today }, status: { in: ["SUBMITTED", "APPROVED"] } },
    },
    include: {
      trade: { select: { name: true } }, subcontractor: { select: { name: true } }, activity: { select: { code: true, name: true } },
      dpr: { select: { reportDate: true, status: true, project: { select: { code: true, name: true } } } },
    },
    orderBy: [{ dpr: { reportDate: "desc" } }, { createdAt: "asc" }],
    take: 400,
  });
  const allowed = new Set(ctx.projectIds);
  return rows
    .filter((r) => ctx.allProjects || allowed.has(r.projectId))
    .map((r) =>
      redact(ctx, {
        id: r.id, projectId: r.projectId, date: dateKey(r.dpr.reportDate), projectCode: r.dpr.project.code, projectName: r.dpr.project.name,
        status: r.dpr.status, trade: r.trade.name, source: r.source, subcontractor: r.subcontractor?.name ?? null,
        activity: r.activity ? `${r.activity.code} ${r.activity.name}` : null, headcount: r.headcount, hours: num(r.hours), mandays: num(r.mandays),
        dailyLabourCost: num(r.dailyLabourCost),
      }, r.projectId),
    );
}
export type LabourRowView = Awaited<ReturnType<typeof labourSummary>>[number];
