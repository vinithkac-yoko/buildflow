import type { IssueSeverity, ProjectStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, can, redact } from "../auth/permissions";
import { DAY_MS, addDays, dateKey, dayDiff, istToday } from "../dates";
import { forbidden, notFound } from "../errors";
import { formatDate } from "@/lib/format";
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
  /** Open NCRs (any severity) and how many of them are Major or Critical. */
  openNcrs: number;
  seriousNcrs: number;
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

  const [activities, lastApproved, pending, issues, recent, approvedToday, stock, openNcrs] = await Promise.all([
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
    db.ncr.findMany({ where: { projectId: { in: ids }, status: { not: "CLOSED" } }, select: { id: true, projectId: true, code: true, severity: true, defect: true, status: true } }),
  ]);

  const byProject = <T extends { projectId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.projectId, [...(m.get(r.projectId) ?? []), r]);
    return m;
  };
  const actsBy = byProject(activities);
  const issuesBy = byProject(issues);
  const ncrBy = byProject(openNcrs);
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
      ? computeHealth({ gapPct: gap, majorNcr: (ncrBy.get(p.id) ?? []).filter((n) => n.severity === "MAJOR").length, criticalNcr: (ncrBy.get(p.id) ?? []).filter((n) => n.severity === "CRITICAL").length, criticalIssues: critical.length, reportsLast7: recentBy.get(p.id) ?? 0 })
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
      openIssues: proj.length, criticalIssues: critical.length, openNcrs: (ncrBy.get(p.id) ?? []).length, seriousNcrs: (ncrBy.get(p.id) ?? []).filter((n) => n.severity !== "MINOR").length, health,
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
        detail: `Last approved: ${lastDate ? formatDate(lastDate) : "never"}${eng ? ` · engineer ${eng.name}` : ""}`, href: `/progress?project=${p.id}`,
      });
    }
    for (const n of (ncrBy.get(p.id) ?? []).filter((x) => x.severity !== "MINOR")) {
      attention.push({ ...base, kind: "NCR", priority: n.severity === "CRITICAL" ? 1 : 2, title: `${n.code}: ${n.defect.slice(0, 90)}${n.defect.length > 90 ? "…" : ""}`, detail: `${n.severity === "CRITICAL" ? "Critical" : "Major"} NCR · ${n.status === "OPEN" ? "no corrective action yet" : n.status.toLowerCase().replace("_", " ")}`, href: `/ncr/${n.id}` });
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
  /** What needs attention on this project (same items as the portfolio list). */
  attention: AttentionItem[];
  ongoingDelays: number;
  wbs: WbsProgress[];
  curve: CurvePoint[];
  weightNote: string;
}

type ProgressLine = { activityId: string; quantity: unknown; dpr: { reportDate: Date } };

/** Cumulative planned vs actual % over the project's life. Actual stops at today; planned runs to the baseline finish. */
function curveFor(
  project: { baselineStart: Date; baselineFinish: Date },
  plan: PlanActivity[],
  lines: ProgressLine[],
  today: Date,
): CurvePoint[] {
  const cumulative = new Map<string, { date: Date; qty: number }[]>();
  const running = new Map<string, number>();
  for (const r of [...lines].sort((a, b) => a.dpr.reportDate.getTime() - b.dpr.reportDate.getTime())) {
    const q = (running.get(r.activityId) ?? 0) + num(r.quantity as number);
    running.set(r.activityId, q);
    const series = cumulative.get(r.activityId) ?? [];
    series.push({ date: r.dpr.reportDate, qty: q });
    cumulative.set(r.activityId, series);
  }
  const from = project.baselineStart <= today ? project.baselineStart : today;
  const to = project.baselineFinish > today ? project.baselineFinish : today;
  const step = Math.max(3, Math.round((to.getTime() - from.getTime()) / DAY_MS / 60));
  return buildSCurve(plan, cumulative, from, to, step).map((pt) => (new Date(pt.date) > today ? { ...pt, actual: null as unknown as number } : pt));
}

const toPlan = (acts: { id: string; plannedCost: unknown; plannedMandays: unknown; plannedQty: unknown; actualQty: unknown; plannedStart: Date; plannedFinish: Date }[]): PlanActivity[] =>
  acts.map((a) => ({
    id: a.id, cost: num(a.plannedCost as number), mandays: num(a.plannedMandays as number), plannedQty: num(a.plannedQty as number),
    actualQty: num(a.actualQty as number), start: a.plannedStart, finish: a.plannedFinish,
  }));

/** S-curves for several projects at once (the portfolio's small multiples). Only projects the caller can see are returned. */
export async function portfolioCurves(ctx: Ctx, projectIds: string[]): Promise<Map<string, CurvePoint[]>> {
  assertCan(ctx, "read", "dashboard");
  const ids = projectIds.filter((id) => ctx.allProjects || ctx.projectIds.includes(id));
  const today = istToday(ctx.now);
  const [projects, acts, lines] = await Promise.all([
    db.project.findMany({ where: { id: { in: ids } }, select: { id: true, baselineStart: true, baselineFinish: true } }),
    db.activity.findMany({ where: { projectId: { in: ids } }, select: { id: true, projectId: true, plannedCost: true, plannedMandays: true, plannedQty: true, actualQty: true, plannedStart: true, plannedFinish: true } }),
    db.dprActivityProgress.findMany({
      where: { projectId: { in: ids }, dpr: { status: "APPROVED" } },
      select: { projectId: true, activityId: true, quantity: true, dpr: { select: { reportDate: true } } },
    }),
  ]);
  const out = new Map<string, CurvePoint[]>();
  for (const p of projects) {
    const plan = toPlan(acts.filter((a) => a.projectId === p.id));
    if (plan.length === 0) continue;
    out.set(p.id, curveFor(p, plan, lines.filter((l) => l.projectId === p.id), today));
  }
  return out;
}

/** One project's progress with WBS-level bars and the S-curve (built from approved DPR history). */
export async function projectDetailProgress(ctx: Ctx, projectId: string): Promise<ProjectDetailProgress> {
  assertCan(ctx, "read", "project", projectId);
  const today = istToday(ctx.now);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, baselineStart: true, baselineFinish: true } });
  if (!project) throw notFound("That project");
  const portfolio = await computePortfolio(ctx, projectId);
  const [base] = portfolio.projects;
  if (!base) throw notFound("That project");
  const ongoingDelays = can(ctx, "read", "delay", projectId) ? await db.delay.count({ where: { projectId, endDate: null } }) : 0;

  const [acts, wbsNodes, lines] = await Promise.all([
    db.activity.findMany({ where: { projectId }, include: { wbsNode: { select: { code: true } } } }),
    db.wbsNode.findMany({ where: { projectId, parentId: null }, orderBy: { seq: "asc" } }),
    db.dprActivityProgress.findMany({
      where: { projectId, dpr: { status: "APPROVED" } },
      select: { activityId: true, quantity: true, dpr: { select: { reportDate: true } } },
    }),
  ]);
  const plan = toPlan(acts);
  const top = new Map(acts.map((a) => [a.id, a.wbsNode.code.split(".")[0]]));
  const wbs: WbsProgress[] = wbsNodes.map((n) => {
    const mine = plan.filter((a) => top.get(a.id) === n.code);
    return { code: n.code, name: n.name, plannedPct: Math.round(plannedPct(mine, today) * 10) / 10, actualPct: Math.round(actualPct(mine) * 10) / 10, activities: mine.length };
  });
  return {
    ...base, attention: portfolio.attention.filter((a) => a.projectId === projectId), ongoingDelays, wbs, curve: curveFor(project, plan, lines, today),
    weightNote: base.method === "cost" ? "Weighted by each activity's planned cost." : base.method === "mandays" ? "Weighted by planned mandays (cost is not available)." : "Every activity counts equally.",
  };
}

// ───────────── Client portal ─────────────

export interface ClientPortalView {
  projectId: string;
  code: string;
  name: string;
  location: string;
  status: ProjectStatus;
  startDate: string;
  /** The finish date in the original agreement, and the current expected date. */
  promisedFinish: string;
  expectedFinish: string;
  /** Approved work only. No plan comparison, days behind, health, issues or cost. */
  actualPct: number;
  stages: { code: string; name: string; actualPct: number }[];
  lastUpdate: string | null;
  updates: { id: string; date: string; weather: string | null; workedOn: string[]; photoIds: string[] }[];
  photoCount: number;
  documents: { id: string; title: string; category: string; versionId: string; updatedAt: string }[];
}

const WEATHER_TEXT: Record<string, string> = { SUNNY: "Sunny", CLOUDY: "Cloudy", RAIN: "Rain", HEAVY_RAIN: "Heavy rain" };

/**
 * What the homeowner sees of their project: approved progress only, the last approved site updates with the photos the PM chose
 * to share, and released documents. Everything internal (plan, health, issues, NCRs, delays, cost, remarks) is left out here,
 * in the service, rather than hidden on screen.
 */
export async function clientPortal(ctx: Ctx, projectId: string): Promise<ClientPortalView> {
  assertCan(ctx, "read", "project", projectId);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, location: true, status: true, baselineStart: true, baselineFinish: true, currentFinish: true } });
  if (!project) throw notFound("That project");
  const [acts, wbsNodes, dprs, photoCount, docs] = await Promise.all([
    db.activity.findMany({ where: { projectId }, include: { wbsNode: { select: { code: true } } } }),
    db.wbsNode.findMany({ where: { projectId, parentId: null }, orderBy: { seq: "asc" } }),
    db.dpr.findMany({
      where: { projectId, status: "APPROVED" },
      orderBy: { reportDate: "desc" }, take: 8,
      select: {
        id: true, reportDate: true, weather: true, noWork: true,
        progress: { where: { quantity: { gt: 0 } }, select: { activity: { select: { name: true } } } },
        photos: { where: { clientVisible: true }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 6 },
      },
    }),
    db.dprPhoto.count({ where: { projectId, clientVisible: true, dpr: { status: "APPROVED" } } }),
    db.document.findMany({
      where: { projectId, status: "RELEASED" }, orderBy: { updatedAt: "desc" }, take: 5,
      select: { id: true, title: true, category: true, updatedAt: true, versions: { where: { isCurrent: true }, select: { id: true }, take: 1 } },
    }),
  ]);
  const plan = toPlan(acts);
  const top = new Map(acts.map((a) => [a.id, a.wbsNode.code.split(".")[0]]));
  return {
    projectId, code: project.code, name: project.name, location: project.location, status: project.status,
    startDate: dateKey(project.baselineStart), promisedFinish: dateKey(project.baselineFinish), expectedFinish: dateKey(project.currentFinish),
    actualPct: plan.length ? Math.round(actualPct(plan) * 10) / 10 : 0,
    stages: wbsNodes.map((n) => ({ code: n.code, name: n.name, actualPct: Math.round(actualPct(plan.filter((a) => top.get(a.id) === n.code)) * 10) / 10 })),
    lastUpdate: dprs[0] ? dateKey(dprs[0].reportDate) : null,
    updates: dprs.map((d) => ({
      id: d.id, date: dateKey(d.reportDate), weather: d.weather ? WEATHER_TEXT[d.weather] ?? null : null,
      workedOn: d.noWork ? [] : [...new Set(d.progress.map((p) => p.activity.name))].slice(0, 6), photoIds: d.photos.map((p) => p.id),
    })),
    photoCount,
    documents: docs.filter((d) => d.versions[0]).map((d) => ({ id: d.id, title: d.title, category: d.category, versionId: d.versions[0].id, updatedAt: d.updatedAt.toISOString() })),
  };
}
