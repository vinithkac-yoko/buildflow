import type { DprStatus, LabourSource, Prisma, Weather } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan, can, redact } from "../auth/permissions";
import { dateKey, istToday } from "../dates";
import { forbidden, notFound } from "../errors";
import { availableByMaterial } from "../inventory/stock";
import type { Ctx } from "../types";

const num = (d: { toString(): string } | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d.toString()));

export interface ReportActivity {
  id: string; code: string; name: string; unit: string; plannedQty: number; actualQty: number;
  status: string; wbs: string; tradeId: string | null; tradeName: string | null; today: boolean;
}
export interface ReportLabour {
  activityId: string | null; source: LabourSource; tradeId: string; subcontractorId: string | null; headcount: number; hours: number;
}
export interface EngineerReport {
  project: { id: string; code: string; name: string };
  reportDate: string;
  dpr: null | {
    id: string; status: DprStatus; weather: Weather | null; remarks: string | null; noWork: boolean;
    rejectionReason: string | null; submittedByName: string | null; submittedAt: string | null;
    progress: { activityId: string; quantity: number }[];
    labour: ReportLabour[];
    materials: { activityId: string; materialId: string; quantity: number }[];
    photos: { id: string; name: string; sizeBytes: number }[];
    teammateLines: number;
  };
  activities: ReportActivity[];
  yesterday: null | { date: string; activityIds: string[]; labour: ReportLabour[] };
  lastWeather: Weather | null;
  trades: { value: string; label: string }[];
  subcontractors: { id: string; name: string; tradeId: string }[];
  materials: { id: string; name: string; unit: string; available: number; forActivityIds: string[] }[];
  issues: { id: string; code: string; title: string; severity: string; status: string }[];
  pmName: string | null;
}

/** Everything the Site Engineer's DPR screen needs. Contains no money. */
export async function engineerReport(ctx: Ctx, projectId: string): Promise<EngineerReport> {
  assertCan(ctx, "read", "dpr", projectId);
  const today = istToday(ctx.now);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw notFound("That project");

  const [dpr, activities, previous, trades, subs, materials, available, issues, pm] = await Promise.all([
    db.dpr.findUnique({
      where: { projectId_reportDate: { projectId, reportDate: today } },
      include: { progress: true, labour: true, materials: true, photos: { orderBy: { createdAt: "asc" } }, submittedBy: { select: { name: true } } },
    }),
    db.activity.findMany({
      where: { projectId },
      include: { uom: { select: { code: true } }, trade: { select: { id: true, name: true } }, wbsNode: { select: { name: true } }, boms: { select: { materialId: true } } },
      orderBy: { code: "asc" },
    }),
    db.dpr.findFirst({
      where: { projectId, reportDate: { lt: today }, status: { in: ["SUBMITTED", "APPROVED"] } },
      orderBy: { reportDate: "desc" },
      include: { progress: true, labour: true },
    }),
    db.trade.findMany({ orderBy: { name: "asc" } }),
    db.subcontractor.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, tradeId: true } }),
    db.material.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, uom: { select: { code: true } } } }),
    availableByMaterial(projectId),
    db.issue.findMany({ where: { projectId, status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, code: true, title: true, severity: true, status: true } }),
    db.projectAssignment.findFirst({ where: { projectId, user: { role: "PROJECT_MANAGER" } }, select: { user: { select: { name: true } } } }),
  ]);

  const mine = <T extends { enteredById: string }>(rows: T[]) => rows.filter((r) => r.enteredById === ctx.userId);
  const todaysActs: ReportActivity[] = activities
    .filter((a) => a.status !== "COMPLETED" || (dpr?.progress ?? []).some((p) => p.activityId === a.id))
    .map((a) => ({
      id: a.id, code: a.code, name: a.name, unit: a.uom.code, plannedQty: num(a.plannedQty), actualQty: num(a.actualQty),
      status: a.status, wbs: a.wbsNode.name, tradeId: a.trade?.id ?? null, tradeName: a.trade?.name ?? null,
      today: a.status === "IN_PROGRESS" || (a.plannedStart <= today && a.plannedFinish >= today),
    }))
    .sort((a, b) => Number(b.today) - Number(a.today) || a.code.localeCompare(b.code));

  const lastWeatherRow = previous?.weather ?? (await db.dpr.findFirst({ where: { projectId, weather: { not: null } }, orderBy: { reportDate: "desc" }, select: { weather: true } }))?.weather ?? null;

  return {
    project, reportDate: dateKey(today),
    dpr: dpr && {
      id: dpr.id, status: dpr.status, weather: dpr.weather, remarks: dpr.remarks, noWork: dpr.noWork,
      rejectionReason: dpr.rejectionReason, submittedByName: dpr.submittedBy?.name ?? null, submittedAt: dpr.submittedAt?.toISOString() ?? null,
      progress: mine(dpr.progress).map((p) => ({ activityId: p.activityId, quantity: num(p.quantity) })),
      labour: mine(dpr.labour).map((l) => ({ activityId: l.activityId, source: l.source, tradeId: l.tradeId, subcontractorId: l.subcontractorId, headcount: l.headcount, hours: num(l.hours) })),
      materials: mine(dpr.materials).map((m) => ({ activityId: m.activityId, materialId: m.materialId, quantity: num(m.quantity) })),
      photos: dpr.photos.map((p) => ({ id: p.id, name: p.originalName, sizeBytes: p.sizeBytes })),
      teammateLines: dpr.progress.length - mine(dpr.progress).length + (dpr.labour.length - mine(dpr.labour).length),
    },
    activities: todaysActs,
    yesterday: previous && {
      date: dateKey(previous.reportDate),
      activityIds: previous.progress.filter((p) => num(p.quantity) > 0).map((p) => p.activityId),
      labour: previous.labour.map((l) => ({ activityId: l.activityId, source: l.source, tradeId: l.tradeId, subcontractorId: l.subcontractorId, headcount: l.headcount, hours: num(l.hours) })),
    },
    lastWeather: lastWeatherRow,
    trades: trades.map((t) => ({ value: t.id, label: t.name })),
    subcontractors: subs,
    materials: materials
      .map((m) => ({
        id: m.id, name: m.name, unit: m.uom.code, available: available.get(m.id) ?? 0,
        forActivityIds: activities.filter((a) => a.boms.some((b) => b.materialId === m.id)).map((a) => a.id),
      }))
      .sort((a, b) => Number(b.available > 0) - Number(a.available > 0) || a.name.localeCompare(b.name)),
    issues,
    pmName: pm?.user.name ?? null,
  };
}

/** Today's report status for each of the caller's projects (for "My Projects"). */
export async function todayStatusByProject(ctx: Ctx, projectIds: string[]): Promise<Map<string, { status: DprStatus; rejectionReason: string | null }>> {
  const rows = await db.dpr.findMany({
    where: { projectId: { in: projectIds }, reportDate: istToday(ctx.now) },
    select: { projectId: true, status: true, rejectionReason: true },
  });
  return new Map(rows.map((r) => [r.projectId, { status: r.status, rejectionReason: r.rejectionReason }]));
}

// ── PM / Owner views ──

export interface DprListItem {
  id: string; projectId: string; projectCode: string; projectName: string; reportDate: string; status: DprStatus;
  weather: Weather | null; noWork: boolean; engineer: string; activityCount: number; mandays: number; photoCount: number;
  submittedAt: string | null;
}

export async function listDprs(
  ctx: Ctx,
  f: { projectId?: string; status?: DprStatus; from?: Date; to?: Date; take?: number } = {},
): Promise<DprListItem[]> {
  assertCan(ctx, "read", "dpr");
  const rows = await db.dpr.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ? f.projectId : { in: [...ctx.projectIds] } }),
      ...(ctx.role === "CLIENT" ? { status: "APPROVED" as const } : f.status ? { status: f.status } : {}),
      ...(f.from || f.to ? { reportDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    },
    include: {
      project: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      submittedBy: { select: { name: true } },
      progress: { select: { quantity: true } },
      labour: { select: { mandays: true } },
      _count: { select: { photos: true } },
    },
    orderBy: [{ reportDate: "desc" }, { project: { code: "asc" } }],
    take: f.take ?? 60,
  });
  if (!ctx.allProjects) {
    // Projects outside the caller's scope are never returned, even if the filter asked for one.
    const allowed = new Set(ctx.projectIds);
    return rows.filter((r) => allowed.has(r.projectId)).map(toListItem);
  }
  return rows.map(toListItem);
}

type ListRow = Prisma.DprGetPayload<{
  include: {
    project: { select: { code: true; name: true } };
    createdBy: { select: { name: true } };
    submittedBy: { select: { name: true } };
    progress: { select: { quantity: true } };
    labour: { select: { mandays: true } };
    _count: { select: { photos: true } };
  };
}>;

function toListItem(r: ListRow): DprListItem {
  return {
    id: r.id, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, reportDate: dateKey(r.reportDate),
    status: r.status, weather: r.weather, noWork: r.noWork, engineer: (r.submittedBy ?? r.createdBy).name,
    activityCount: r.progress.filter((p) => num(p.quantity) > 0).length,
    mandays: Number(r.labour.reduce((s, l) => s + num(l.mandays), 0).toFixed(1)),
    photoCount: r._count.photos, submittedAt: r.submittedAt?.toISOString() ?? null,
  };
}

export async function dprDetail(ctx: Ctx, dprId: string) {
  const d = await db.dpr.findUnique({
    where: { id: dprId },
    include: {
      project: { select: { id: true, code: true, name: true } },
      createdBy: { select: { name: true } }, submittedBy: { select: { name: true } }, approvedBy: { select: { name: true } },
      progress: { include: { activity: { select: { id: true, code: true, name: true, plannedQty: true, actualQty: true, status: true, uom: { select: { code: true } } } } } },
      labour: { include: { trade: { select: { name: true } }, subcontractor: { select: { name: true } }, activity: { select: { code: true, name: true } } } },
      materials: { include: { material: { select: { name: true, uom: { select: { code: true } } } }, activity: { select: { code: true, name: true } } } },
      photos: { orderBy: { createdAt: "asc" } },
      issues: { select: { id: true, code: true, title: true, severity: true, status: true } },
    },
  });
  if (!d) throw notFound("That report");
  assertCan(ctx, "read", "dpr", d.projectId);
  if (ctx.role === "CLIENT" && d.status !== "APPROVED") throw forbidden("That report isn't available yet.");

  const avail = await availableByMaterial(d.projectId);
  const needs = new Map<string, number>();
  for (const m of d.materials) needs.set(m.materialId, (needs.get(m.materialId) ?? 0) + num(m.quantity));
  const shortages = d.status === "SUBMITTED"
    ? [...needs].filter(([id, n]) => (avail.get(id) ?? 0) + 1e-9 < n).map(([id, n]) => {
        const m = d.materials.find((x) => x.materialId === id)!;
        return { materialId: id, name: m.material.name, unit: m.material.uom.code, needed: n, available: avail.get(id) ?? 0 };
      })
    : [];

  const doneBefore = d.status === "APPROVED";
  return redact(ctx, {
    id: d.id, projectId: d.projectId, project: d.project, reportDate: dateKey(d.reportDate), status: d.status, weather: d.weather,
    remarks: d.remarks, noWork: d.noWork, rejectionReason: d.rejectionReason,
    createdByName: d.createdBy.name, submittedByName: d.submittedBy?.name ?? null, approvedByName: d.approvedBy?.name ?? null,
    submittedAt: d.submittedAt?.toISOString() ?? null, approvedAt: d.approvedAt?.toISOString() ?? null,
    progress: d.progress.map((p) => {
      const planned = num(p.activity.plannedQty);
      const cumulative = num(p.activity.actualQty); // includes this report once approved
      return {
        id: p.id, activityId: p.activityId, code: p.activity.code, name: p.activity.name, unit: p.activity.uom.code,
        quantity: num(p.quantity), plannedQty: planned, cumulativeQty: doneBefore ? cumulative : cumulative + num(p.quantity),
        activityStatus: p.activity.status,
      };
    }),
    labour: d.labour.map((l) => ({
      id: l.id, projectId: d.projectId, activity: l.activity ? `${l.activity.code} ${l.activity.name}` : null, trade: l.trade.name, source: l.source,
      subcontractor: l.subcontractor?.name ?? null, headcount: l.headcount, hours: num(l.hours), mandays: num(l.mandays), dailyLabourCost: num(l.dailyLabourCost),
    })),
    materials: d.materials.map((m) => ({ id: m.id, activity: `${m.activity.code} ${m.activity.name}`, material: m.material.name, unit: m.material.uom.code, quantity: num(m.quantity) })),
    photos: d.photos.map((p) => ({ id: p.id, name: p.originalName, clientVisible: p.clientVisible })),
    issues: d.issues,
    shortages,
    canApprove: can(ctx, "approve", "dpr", d.projectId),
  }, d.projectId);
}
export type DprDetail = Awaited<ReturnType<typeof dprDetail>>;
