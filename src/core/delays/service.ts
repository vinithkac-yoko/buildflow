import type { DelayCategory, ResponsibleFunction } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, canSeeField, redact } from "../auth/permissions";
import { demoFlag, nextCode } from "../common";
import { dateKey, dayDiff, istToday } from "../dates";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";

export const DELAY_CATEGORIES = [
  "WEATHER", "MATERIAL_SUPPLY", "LABOUR_AVAILABILITY", "DRAWING_APPROVAL", "CLIENT_DECISION", "SUBCONTRACTOR_PERFORMANCE",
  "EQUIPMENT", "DESIGN_CHANGE", "QUALITY_REWORK", "UTILITIES_PERMITS", "OTHER",
] as const satisfies readonly DelayCategory[];
export const DELAY_CATEGORY_LABEL: Record<DelayCategory, string> = {
  WEATHER: "Weather", MATERIAL_SUPPLY: "Material supply", LABOUR_AVAILABILITY: "Labour availability", DRAWING_APPROVAL: "Drawing approval",
  CLIENT_DECISION: "Client decision", SUBCONTRACTOR_PERFORMANCE: "Subcontractor performance", EQUIPMENT: "Equipment", DESIGN_CHANGE: "Design change",
  QUALITY_REWORK: "Quality rework", UTILITIES_PERMITS: "Utilities and permits", OTHER: "Other",
};
export const RESPONSIBLE_FUNCTIONS = ["SITE_EXECUTION", "PROCUREMENT", "DESIGN", "PLANNING", "QUALITY", "CLIENT_SIDE", "FINANCE", "EXTERNAL_AUTHORITY"] as const satisfies readonly ResponsibleFunction[];
export const FUNCTION_LABEL: Record<ResponsibleFunction, string> = {
  SITE_EXECUTION: "Site execution", PROCUREMENT: "Procurement", DESIGN: "Design", PLANNING: "Planning", QUALITY: "Quality",
  CLIENT_SIDE: "Client side", FINANCE: "Finance", EXTERNAL_AUTHORITY: "External authority",
};

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
export const delayInput = z.object({
  category: z.enum(DELAY_CATEGORIES, { errorMap: () => ({ message: "Pick the delay category." }) }),
  delayFactor: z.string({ required_error: "Say what caused the delay." }).trim().min(5, "Say what caused the delay (a sentence).").max(300),
  activityId: z.string().min(1).nullish(),
  startDate: dateStr,
  endDate: dateStr.nullish(),
  criticalPathImpact: z.boolean().default(false),
  costImpact: z.number({ invalid_type_error: "Cost impact must be a number." }).min(0, "Cost impact can't be negative.").max(1e10).nullish(),
  evidence: z.string({ required_error: "Describe the evidence." }).trim().min(5, "Describe the evidence (photos, messages, reports).").max(500),
  impact: z.string().trim().max(500).nullish(),
  responsibleFunction: z.enum(RESPONSIBLE_FUNCTIONS, { errorMap: () => ({ message: "Pick the responsible function — a team, not a person." }) }),
  correctiveAction: z.string().trim().max(500).nullish(),
});

const midnight = (s: string) => new Date(`${s}T00:00:00.000Z`);
/** Days lost, counting both the first and the last day. An ongoing delay counts up to today. */
export function daysLostBetween(start: Date, end: Date | null, today: Date) {
  return Math.max(0, dayDiff(end ?? today, start) + 1);
}

/** Record a delay: cause, evidence and impact against a function, never a person. */
export async function recordDelay(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "delay", projectId);
  const i = delayInput.parse(raw);
  const today = istToday(ctx.now);
  const start = midnight(i.startDate);
  const end = i.endDate ? midnight(i.endDate) : null;
  if (start > today) throw validation("A delay can't start in the future. Record it once it has begun.", { startDate: "Pick today or an earlier date." });
  if (end && end < start) throw validation("The end date can't be before the start date.", { endDate: "Pick a date on or after the start." });
  if (end && end > today) throw validation("The end date can't be in the future. Leave it empty while the delay is still going on.", { endDate: "Pick today or an earlier date, or leave empty." });
  return db.$transaction(async (tx) => {
    if (i.activityId) {
      const a = await tx.activity.findUnique({ where: { id: i.activityId }, select: { projectId: true } });
      if (!a || a.projectId !== projectId) throw validation("Pick an activity from this project.", { activityId: "Pick an activity from this project." });
    }
    const code = await nextCode(tx, "DLY");
    const cost = canSeeField(ctx, "plannedCost", projectId) ? i.costImpact ?? 0 : 0; // cost data can't be written by roles that can't see it
    const d = await tx.delay.create({
      data: {
        code, projectId, activityId: i.activityId ?? null, category: i.category, delayFactor: i.delayFactor, startDate: start, endDate: end,
        daysLost: daysLostBetween(start, end, today), criticalPathImpact: i.criticalPathImpact, costImpact: cost, evidence: i.evidence, impact: i.impact || null,
        responsibleFunction: i.responsibleFunction, correctiveAction: i.correctiveAction || null, recordedById: ctx.userId, ...demoFlag(),
      },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "Delay", entityId: d.id, projectId, activityId: i.activityId ?? null, after: { code, category: i.category, daysLost: d.daysLost, criticalPathImpact: i.criticalPathImpact } });
    return d.id;
  });
}

/** Close an ongoing delay on a given date; the days lost are fixed from then on. */
export async function endDelay(ctx: Ctx, delayId: string, endDate: string) {
  const parsed = dateStr.safeParse(endDate);
  if (!parsed.success) throw validation("Pick a valid date.", { endDate: "Pick a valid date." });
  return db.$transaction(async (tx) => {
    const d = await tx.delay.findUnique({ where: { id: delayId } });
    if (!d) throw notFound("That delay");
    assertCan(ctx, "update", "delay", d.projectId);
    if (d.endDate) throw conflict(`${d.code} has already ended.`);
    const end = midnight(endDate);
    const today = istToday(ctx.now);
    if (end < d.startDate) throw validation("The end date can't be before the start date.", { endDate: "Pick a date on or after the start." });
    if (end > today) throw validation("The end date can't be in the future.", { endDate: "Pick today or an earlier date." });
    const days = daysLostBetween(d.startDate, end, today);
    await tx.delay.update({ where: { id: delayId }, data: { endDate: end, daysLost: days } });
    await writeAudit(tx, ctx, { action: "UPDATE", entity: "Delay", entityId: delayId, projectId: d.projectId, before: { endDate: null }, after: { endDate, daysLost: days } });
  });
}

export async function listDelays(ctx: Ctx, f: { projectId?: string; ongoing?: boolean } = {}) {
  assertCan(ctx, "read", "delay");
  if (f.projectId && !ctx.allProjects && !ctx.projectIds.includes(f.projectId)) return [];
  const today = istToday(ctx.now);
  const rows = await db.delay.findMany({
    where: {
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(ctx.allProjects ? {} : { projectId: f.projectId ?? { in: [...ctx.projectIds] } }),
      ...(f.ongoing ? { endDate: null } : {}),
    },
    include: { project: { select: { code: true, name: true } }, activity: { select: { code: true, name: true } } },
    orderBy: [{ startDate: "desc" }],
    take: 100,
  });
  return rows.map((r) =>
    redact(ctx, {
      id: r.id, code: r.code, projectId: r.projectId, projectCode: r.project.code, projectName: r.project.name, activity: r.activity ? `${r.activity.code} ${r.activity.name}` : null,
      category: r.category, delayFactor: r.delayFactor, startDate: dateKey(r.startDate), endDate: r.endDate ? dateKey(r.endDate) : null, ongoing: r.endDate === null,
      daysLost: r.endDate ? r.daysLost : daysLostBetween(r.startDate, null, today), criticalPathImpact: r.criticalPathImpact, costImpact: Number(r.costImpact),
      evidence: r.evidence, impact: r.impact, responsibleFunction: r.responsibleFunction, correctiveAction: r.correctiveAction,
    }, r.projectId),
  );
}
export type DelayRow = Awaited<ReturnType<typeof listDelays>>[number];
