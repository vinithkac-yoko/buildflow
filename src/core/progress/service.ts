import type { IssueSeverity, ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, redact } from "../auth/permissions";
import { DAY_MS, addDays, dateKey, dayDiff, istToday } from "../dates";
import { forbidden, notFound } from "../errors";
import type { Ctx } from "../types";
import {
  actualPct, buildSCurve, daysAheadBehind, plannedPct, scheduleBand, weightMethod, type CurvePoint, type PlanActivity, type ScheduleBand, type WeightMethod,
} from "./calc";

const num = (d: { toString(): string } | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d.toString()));

export type HealthBand = "HEALTHY" | "WATCH" | "AT_RISK";

export interface Health {
  score: number;
  band: HealthBand;
  schedule: number; // /50
  ncr: number; // /20
  issues: number; // /15
  compliance: number; // /15
}

export interface ProjectProgress {
  projectId: string;
  code: string;
  name: string;
  clientName: string;
  status: ProjectStatus;
  isDemo: boolean;
  pmId: string | null;
  pmName: string | null;
  engineerName: string | null;
  contractValue?: string;
  baselineFinish: string;
  currentFinish: string;
  plannedPct: number;
  actualPct: number;
  band: ScheduleBand;
  daysAheadBehind: number;
  method: WeightMethod;
  lastApprovedDate: string | null;
  lastApprovedAt: string | null;
  /** Days since the last approved report (0 = today). null if there has never been one. */
  daysSinceReport: number | null;
  missingReport: boolean;
  pendingReports: number;
  openIssues: number;
  criticalIssues: number;
  health: Health | null;
}

const HEALTH_FORMULA = "Schedule 50 + open NCRs 20 + open critical issues 15 + report submission (last 7 days) 15. Schedule loses 2 points per percentage point behind plan; each open major NCR costs 10 (critical 20); each open critical issue costs 10; each missing report in the last 7 days costs about 2.";
export const healthFormula = () => HEALTH_FORMULA;

export function computeHealth(a: { gapPct: number; majorNcr: number; criticalNcr: number; criticalIssues: number; reportsLast7: number }): Health {
  const schedule = Math.round(Math.max(0, 50 - Math.max(0, -a.gapPct) * 2));
  const ncr = Math.max(0, 20 - a.majorNcr * 10 - a.criticalNcr * 20);
  const issues = Math.max(0, 15 - a.criticalIssues * 10);
  const compliance = Math.round((Math.min(7, a.reportsLast7) / 7) * 15);
  const score = schedule + ncr + issues + compliance;
  return { score, band: score >= 75 ? "HEALTHY" : score >= 50 ? "WATCH" : "AT_RISK", schedule, ncr, issues, compliance };
}

export interface AttentionItem {
  kind: "BEHIND_ACTIVITY" | "PENDING_DPR" | "MISSING_DPR" | "NCR" | "CRITICAL_ISSUE" | "LOW_STOCK";
  /** 1 = act now, 2 = soon, 3 = watch */
  priority: 1 | 2 | 3;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  detail: string;
  href: string;
}

export interface Portfolio {
  generatedAt: string;
  today: string;
  freshness: { approvedToday: number; lastUpdate: string | null };
  projects: ProjectProgress[];
  attention: AttentionItem[];
}

/** Which projects the caller's dashboard covers: everything they can see, live or planned. */
async function loadScope(ctx: Ctx, projectId?: string) {
  const where = {
    ...(projectId ? { id: projectId } : {}),
    ...(ctx.allProjects ? {} : { id: projectId ? projectId : { in: [...ctx.projectIds] } }),
  };
  const projects = await db.project.findMany({
    where,
    include: {
      client: { select: { name: true } },
      assignments: { include: { user: { select: { id: true, name: true, role: true } } } },
    },
    orderBy: { code: "asc" },
  });
  if (projectId && !ctx.allProjects && !ctx.projectIds.includes(projectId)) return [];
  return projects;
}

/** The portfolio screen: Owner and Project Managers only. */
export async function portfolioProgress(ctx: Ctx): Promise<Portfolio> {
  if (ctx.role !== "OWNER" && ctx.role !== "PROJECT_MANAGER") throw forbidden("The portfolio view is for the Owner and Project Managers.");
  return computePortfolio(ctx);
}

/** Progress maths for the projects the caller can see (optionally one project). Percentages carry no money. */
async function computePortfolio(ctx: Ctx, onlyProjectId?: string): Promise<Portfolio> {
  assertCan(ctx, "read", "dashboard");
  const today = istToday(ctx.now);
  const projects = await loadScope(ctx, onlyProjectId);
  const ids = projects.map((p) => p.id);

  const [activities, lastApproved, pending, issues, recent, approvedToday, stock] = await Promise.all([
    db.activity.findMany({
      where: { projectId: { in: ids } },
      select: { id: true, projectId: true, code: true, name: true, status: true, criticalPath: true, plannedCost: true, plannedMandays: true, plannedQty: true, actualQty: true, plannedStart: true, plannedFinish: true },
    }),
    db.dpr.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: "APPROVED" }, _max: { reportDate: true, approvedAt: true } }),
    db.dpr.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: "SUBMITTED" }, _count: true }),
    db.issue.findMany({ where: { projectId: { in: ids }, status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { projectId: true, severity: true, title: true, id: true } }),
    db.dpr.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: { in: ["SUBMITTED", "APPROVED"] }, reportDate: { gt: addDays(today, -7), lte: today } }, _count: true }),
    db.dpr.findMany({ where: { projectId: { in: ids }, status: "APPROVED", approvedAt: { gte: new Date(today.getTime() - 5.5 * 3_600_000) } }, select: { approvedAt: true } }),
    db.stockBalance.findMany({
      where: { projectId: { in: ids } },
      select: { projectId: true, quantity: true, materialId: true, material: { select: { name: true, reorderThreshold: true, uom: { select: { code: true } } } } },
    }),
  ]);

  const byProject = <T extends { projectId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.projectId, [...(m.get(r.projectId) ?? []), r]);
    return m;
  };
  const actsBy = byProject(activities);
  const issuesBy = byProject(issues);
  const lastBy = new Map(lastApproved.map((r) => [r.projectId, r._max]));
  const pendingBy = new Map(pending.map((r) => [r.projectId, r._count]));
  const recentBy = new Map(recent.map((r) => [r.projectId, r._count]));

  const attention: AttentionItem[] = [];
  const out: ProjectProgress[] = [];

  for (const p of projects) {
    const acts = actsBy.get(p.id) ?? [];
    const plan: PlanActivity[] = acts.map((a) => ({
      id: a.id, cost: num(a.plannedCost), mandays: num(a.plannedMandays), plannedQty: num(a.plannedQty), actualQty: num(a.actualQty),
      start: a.plannedStart, finish: a.plannedFinish,
    }));
    const live = p.status === "ACTIVE" || p.status === "DELAYED" || p.status === "ON_HOLD";
    const planned = plan.length && live ? plannedPct(plan, today) : 0;
    const actual = plan.length ? actualPct(plan) : 0;
    const last = lastBy.get(p.id);
    const lastDate = last?.reportDate ?? null;
    const daysSince = lastDate ? dayDiff(today, lastDate) : null;
    const missing = (p.status === "ACTIVE" || p.status === "DELAYED") && (daysSince === null ? dayDiff(today, p.baselineStart) > 1 : daysSince > 1);
    const proj = issuesBy.get(p.id) ?? [];
    const critical = proj.filter((i) => i.severity === "CRITICAL");
    const pm = p.assignments.find((a) => a.user.role === "PROJECT_MANAGER")?.user ?? null;
    const eng = p.assignments.find((a) => a.user.role === "SITE_ENGINEER")?.user ?? null;
    const gap = actual - planned;
    const health = p.status === "ACTIVE" || p.status === "DELAYED"
      ? computeHealth({ gapPct: gap, majorNcr: 0, criticalNcr: 0, criticalIssues: critical.length, reportsLast7: recentBy.get(p.id) ?? 0 })
      : null;

    out.push(redact(ctx, {
      projectId: p.id, code: p.code, name: p.name, clientName: p.client.name, status: p.status, isDemo: p.isDemo,
      pmId: pm?.id ?? null, pmName: pm?.name ?? null, engineerName: eng?.name ?? null, contractValue: p.contractValue.toString(),
      baselineFinish: dateKey(p.baselineFinish), currentFinish: dateKey(p.currentFinish),
      plannedPct: Math.round(planned * 10) / 10, actualPct: Math.round(actual * 10) / 10,
      band: live ? scheduleBand(actual, planned) : "NOT_STARTED",
      daysAheadBehind: live && plan.length ? daysAheadBehind(plan, today) : 0, method: weightMethod(plan),
      lastApprovedDate: lastDate ? dateKey(lastDate) : null, lastApprovedAt: last?.approvedAt?.toISOString() ?? null,
      daysSinceReport: daysSince, missingReport: missing, pendingReports: pendingBy.get(p.id) ?? 0,
      openIssues: proj.length, criticalIssues: critical.length, health,
    } satisfies ProjectProgress, p.id));

    // ── needs-attention items ──
    const base = { projectId: p.id, projectCode: p.code, projectName: p.name };
    if (p.status === "ACTIVE" || p.status === "DELAYED") {
      const lagging = acts
        .filter((a) => a.status !== "COMPLETED")
        .map((a) => {
          const pf = plan.find((x) => x.id === a.id)!;
          const shouldBe = plannedPct([pf], today);
          const is = actualPct([pf]);
          return { a, behind: shouldBe - is };
        })
        .filter((x) => x.behind >= 15)
        .sort((x, y) => Number(y.a.criticalPath) - Number(x.a.criticalPath) || y.behind - x.behind)
        .slice(0, 3);
      for (const l of lagging) {
        attention.push({
          ...base, kind: "BEHIND_ACTIVITY", priority: l.a.criticalPath ? 1 : 2,
          title: `${l.a.name} is behind schedule`,
          detail: `${l.a.criticalPath ? "Critical path · " : ""}${Math.round(l.behind)} points behind plan`,
          href: `/projects/${p.id}/planning/activities/${l.a.id}`,
        });
      }
    }
    if ((pendingBy.get(p.id) ?? 0) > 0) {
      attention.push({ ...base, kind: "PENDING_DPR", priority: 2, title: `${pendingBy.get(p.id)} daily report${(pendingBy.get(p.id) ?? 0) > 1 ? "s" : ""} waiting for approval`, detail: "Progress and stock are not updated until approved", href: `/progress?status=SUBMITTED&project=${p.id}` });
    }
    if (missing) {
      attention.push({
        ...base, kind: "MISSING_DPR", priority: 1,
        title: daysSince === null ? "No approved daily report yet" : `No approved daily report for ${daysSince} days`,
        detail: `Last approved: ${lastDate ? dateKey(lastDate) : "never"}${eng ? ` · engineer ${eng.name}` : ""}`, href: `/progress?project=${p.id}`,
      });
    }
    for (const i of proj.filter((x) => x.severity === "CRITICAL" || x.severity === "HIGH")) {
      attention.push({ ...base, kind: "CRITICAL_ISSUE", priority: (i.severity as IssueSeverity) === "CRITICAL" ? 1 : 2, title: i.title, detail: `${i.severity === "CRITICAL" ? "Critical" : "High"} issue · open`, href: `/issues?project=${p.id}` });
    }
  }

  // Low stock: total across locations at or below the material's reorder threshold.
  const totals = new Map<string, { projectId: string; name: string; unit: string; total: number; threshold: number }>();
  for (const s of stock) {
    const k = `${s.projectId}|${s.materialId}`;
    const t = totals.get(k) ?? { projectId: s.projectId, name: s.material.name, unit: s.material.uom.code, total: 0, threshold: num(s.material.reorderThreshold) };
    t.total += num(s.quantity);
    totals.set(k, t);
  }
  const proj = new Map(projects.map((p) => [p.id, p]));
  for (const t of totals.values()) {
    const p = proj.get(t.projectId)!;
    if (t.threshold > 0 && t.total <= t.threshold && (p.status === "ACTIVE" || p.status === "DELAYED")) {
      attention.push({
        projectId: p.id, projectCode: p.code, projectName: p.name, kind: "LOW_STOCK", priority: 2,
        title: `${t.name} is low`, detail: `${Math.round(t.total * 10) / 10} ${t.unit} left (reorder at ${t.threshold})`, href: `/projects/${p.id}`,
      });
    }
  }

  attention.sort((a, b) => a.priority - b.priority || a.projectCode.localeCompare(b.projectCode));
  const lastUpdate = approvedToday.reduce<Date | null>((m, r) => (r.approvedAt && (!m || r.approvedAt > m) ? r.approvedAt : m), null);
  return {
    generatedAt: ctx.now.toISOString(), today: dateKey(today),
    freshness: { approvedToday: approvedToday.length, lastUpdate: lastUpdate?.toISOString() ?? null },
    projects: out, attention,
  };
}

export interface WbsProgress { code: string; name: string; plannedPct: number; actualPct: number; activities: number }
export interface ProjectDetailProgress extends ProjectProgress {
  wbs: WbsProgress[];
  curve: CurvePoint[];
  weightNote: string;
}

/** One project's progress with WBS-level bars and the S-curve (built from approved DPR history). */
export async function projectDetailProgress(ctx: Ctx, projectId: string): Promise<ProjectDetailProgress> {
  assertCan(ctx, "read", "project", projectId);
  const today = istToday(ctx.now);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, baselineStart: true, baselineFinish: true } });
  if (!project) throw notFound("That project");

  const [base] = (await computePortfolio(ctx, projectId)).projects;
  if (!base) throw notFound("That project");

  const [acts, wbsNodes, progress] = await Promise.all([
    db.activity.findMany({ where: { projectId }, include: { wbsNode: { select: { code: true } } } }),
    db.wbsNode.findMany({ where: { projectId, parentId: null }, orderBy: { seq: "asc" } }),
    db.dprActivityProgress.findMany({
      where: { projectId, dpr: { status: "APPROVED" } },
      select: { activityId: true, quantity: true, dpr: { select: { reportDate: true } } },
      orderBy: { dpr: { reportDate: "asc" } },
    }),
  ]);
  const plan: (PlanActivity & { top: string })[] = acts.map((a) => ({
    id: a.id, cost: num(a.plannedCost), mandays: num(a.plannedMandays), plannedQty: num(a.plannedQty), actualQty: num(a.actualQty),
    start: a.plannedStart, finish: a.plannedFinish, top: a.wbsNode.code.split(".")[0],
  }));

  const wbs: WbsProgress[] = wbsNodes.map((n) => {
    const mine = plan.filter((a) => a.top === n.code);
    return { code: n.code, name: n.name, plannedPct: Math.round(plannedPct(mine, today) * 10) / 10, actualPct: Math.round(actualPct(mine) * 10) / 10, activities: mine.length };
  });

  const cumulative = new Map<string, { date: Date; qty: number }[]>();
  const running = new Map<string, number>();
  for (const r of progress) {
    const q = (running.get(r.activityId) ?? 0) + num(r.quantity);
    running.set(r.activityId, q);
    const series = cumulative.get(r.activityId) ?? [];
    series.push({ date: r.dpr.reportDate, qty: q });
    cumulative.set(r.activityId, series);
  }
  const from = project.baselineStart <= today ? project.baselineStart : today;
  const to = project.baselineFinish > today ? project.baselineFinish : today;
  const step = Math.max(3, Math.round(((to.getTime() - from.getTime()) / DAY_MS) / 60));
  const curve = buildSCurve(plan, cumulative, from, to, step)
    // Actual stops at today; planned continues to the baseline finish.
    .map((pt) => (new Date(pt.date) > today ? { ...pt, actual: NaN } : pt));

  return {
    ...base, wbs, curve: curve.map((c) => ({ ...c, actual: Number.isNaN(c.actual) ? (null as unknown as number) : c.actual })),
    weightNote: base.method === "cost" ? "Weighted by each activity's planned cost." : base.method === "mandays" ? "Weighted by planned mandays (cost is not available)." : "Every activity counts equally.",
  };
}
