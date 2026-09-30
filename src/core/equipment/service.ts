import type { EquipmentLogKind, EquipmentStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, can } from "../auth/permissions";
import { demoFlag } from "../common";
import { dateKey, istToday } from "../dates";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = { AVAILABLE: "Available", IN_USE: "In use", MAINTENANCE: "In maintenance", BREAKDOWN: "Broken down" };
export const LOG_KIND_LABEL: Record<EquipmentLogKind, string> = { USAGE: "Usage", MAINTENANCE: "Maintenance", BREAKDOWN: "Breakdown" };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
export const assignInput = z.object({
  projectId: z.string().min(1, "Pick the project."),
  activityId: z.string().min(1).nullish(),
  fromDate: dateStr.nullish(),
  note: z.string().trim().max(300).nullish(),
});
export const equipmentLogInput = z.object({
  kind: z.enum(["USAGE", "MAINTENANCE", "BREAKDOWN"], { errorMap: () => ({ message: "Pick what happened." }) }),
  hours: z.number({ invalid_type_error: "Hours must be a number." }).min(0, "Hours can't be negative.").max(24, "A day has 24 hours — check the number.").nullish(),
  logDate: dateStr.nullish(),
  activityId: z.string().min(1).nullish(),
  note: z.string().trim().max(300).nullish(),
  clientTxnId: z.string().min(8).max(64).nullish(),
});

const midnight = (s: string) => new Date(`${s}T00:00:00.000Z`);
const num = (d: { toString(): string }) => Number(d.toString());

/** Put a piece of equipment on a project (and optionally an activity). It can be on one project at a time. */
export async function assignEquipment(ctx: Ctx, equipmentId: string, raw: unknown) {
  const i = assignInput.parse(raw);
  assertCan(ctx, "create", "equipment_log", i.projectId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Equipment" WHERE id = ${equipmentId} FOR UPDATE`;
    const eq = await tx.equipment.findUnique({ where: { id: equipmentId }, include: { assignments: { where: { toDate: null }, include: { project: { select: { code: true } } } } } });
    if (!eq) throw notFound("That equipment");
    const open = eq.assignments[0];
    if (open) throw conflict(`${eq.name} is already on ${open.project.code} since ${dateKey(open.fromDate)}. Release it there first.`);
    if (eq.status === "BREAKDOWN" || eq.status === "MAINTENANCE") throw conflict(`${eq.name} is ${eq.status === "BREAKDOWN" ? "broken down" : "in maintenance"}, so it can't go to a site yet. Mark it back in service first.`);
    const project = await tx.project.findUnique({ where: { id: i.projectId }, select: { status: true, name: true } });
    if (!project) throw notFound("That project");
    if (project.status !== "ACTIVE" && project.status !== "DELAYED") throw conflict(`${project.name} is not active, so equipment can't be sent there.`);
    if (i.activityId) {
      const a = await tx.activity.findUnique({ where: { id: i.activityId }, select: { projectId: true } });
      if (!a || a.projectId !== i.projectId) throw validation("Pick an activity from this project.", { activityId: "Pick an activity from this project." });
    }
    const row = await tx.equipmentAssignment.create({
      data: { equipmentId, projectId: i.projectId, activityId: i.activityId ?? null, fromDate: i.fromDate ? midnight(i.fromDate) : istToday(ctx.now), note: i.note || null, assignedById: ctx.userId, ...demoFlag() },
    });
    await tx.equipment.update({ where: { id: equipmentId }, data: { status: "IN_USE" } });
    await writeAudit(tx, ctx, { action: "ASSIGN", entity: "Equipment", entityId: equipmentId, projectId: i.projectId, activityId: i.activityId ?? null, after: { equipment: eq.name, from: dateKey(row.fromDate) } });
    return row.id;
  });
}

/** Take equipment off its project. Its last day there is the release date. */
export async function releaseEquipment(ctx: Ctx, equipmentId: string, toDate?: string | null) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Equipment" WHERE id = ${equipmentId} FOR UPDATE`;
    const eq = await tx.equipment.findUnique({ where: { id: equipmentId }, include: { assignments: { where: { toDate: null } } } });
    if (!eq) throw notFound("That equipment");
    const open = eq.assignments[0];
    if (!open) throw conflict(`${eq.name} isn't on any project.`);
    assertCan(ctx, "update", "equipment_log", open.projectId);
    const end = toDate ? midnight(toDate) : istToday(ctx.now);
    if (end < open.fromDate) throw validation("The release date can't be before it arrived.");
    await tx.equipmentAssignment.update({ where: { id: open.id }, data: { toDate: end } });
    await tx.equipment.update({ where: { id: equipmentId }, data: { status: eq.status === "IN_USE" ? "AVAILABLE" : eq.status } });
    await writeAudit(tx, ctx, { action: "RELEASE", entity: "Equipment", entityId: equipmentId, projectId: open.projectId, after: { to: dateKey(end) } });
  });
}

/** Log usage hours, maintenance or a breakdown against the project the equipment is on. */
export async function logEquipment(ctx: Ctx, equipmentId: string, raw: unknown) {
  const i = equipmentLogInput.parse(raw);
  return db.$transaction(async (tx) => {
    if (i.clientTxnId) {
      const dup = await tx.equipmentLog.findUnique({ where: { clientTxnId: i.clientTxnId } });
      if (dup) return dup.id;
    }
    await tx.$queryRaw`SELECT id FROM "Equipment" WHERE id = ${equipmentId} FOR UPDATE`;
    const eq = await tx.equipment.findUnique({ where: { id: equipmentId }, include: { assignments: { where: { toDate: null } } } });
    if (!eq) throw notFound("That equipment");
    const open = eq.assignments[0];
    if (!open) throw conflict(`${eq.name} isn't assigned to a project. Assign it first, then log its use.`);
    assertCan(ctx, "create", "equipment_log", open.projectId);
    const date = i.logDate ? midnight(i.logDate) : istToday(ctx.now);
    if (date > istToday(ctx.now)) throw validation("The date can't be in the future.", { logDate: "Pick today or an earlier date." });
    if (date < open.fromDate) throw validation(`${eq.name} only arrived on ${dateKey(open.fromDate)}.`, { logDate: `Pick ${dateKey(open.fromDate)} or later.` });
    const hours = i.hours ?? 0;
    if (i.kind === "USAGE") {
      if (!(hours > 0)) throw validation("Enter the hours it worked.", { hours: "Enter the hours it worked." });
      const day = await tx.equipmentLog.aggregate({ where: { equipmentId, logDate: date, kind: "USAGE" }, _sum: { hours: true } });
      const already = num(day._sum.hours ?? 0);
      if (already + hours > 24 + 1e-9) throw validation(`That would make ${already + hours} hours in one day. ${eq.name} already has ${already} hours logged on ${dateKey(date)}.`, { hours: `At most ${24 - already} more hours today.` });
    } else if (!i.note?.trim()) {
      throw validation(i.kind === "BREAKDOWN" ? "Say what broke down." : "Say what maintenance was done.", { note: i.kind === "BREAKDOWN" ? "Say what broke down." : "Say what maintenance was done." });
    }
    if (i.activityId) {
      const a = await tx.activity.findUnique({ where: { id: i.activityId }, select: { projectId: true } });
      if (!a || a.projectId !== open.projectId) throw validation("Pick an activity from the project it is on.", { activityId: "Pick an activity from this project." });
    }
    const log = await tx.equipmentLog.create({
      data: { equipmentId, projectId: open.projectId, activityId: i.activityId ?? open.activityId, logDate: date, kind: i.kind, hours, note: i.note || null, loggedById: ctx.userId, clientTxnId: i.clientTxnId ?? null, ...demoFlag() },
    });
    if (i.kind !== "USAGE") await tx.equipment.update({ where: { id: equipmentId }, data: { status: i.kind === "BREAKDOWN" ? "BREAKDOWN" : "MAINTENANCE" } });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "EquipmentLog", entityId: log.id, projectId: open.projectId, activityId: log.activityId, after: { equipment: eq.name, kind: i.kind, hours } });
    return log.id;
  });
}

/** After a breakdown or maintenance: back in service on its project, or available if it is not on one. */
export async function backInService(ctx: Ctx, equipmentId: string) {
  return db.$transaction(async (tx) => {
    const eq = await tx.equipment.findUnique({ where: { id: equipmentId }, include: { assignments: { where: { toDate: null } } } });
    if (!eq) throw notFound("That equipment");
    if (eq.status !== "BREAKDOWN" && eq.status !== "MAINTENANCE") throw conflict(`${eq.name} is already ${EQUIPMENT_STATUS_LABEL[eq.status].toLowerCase()}.`);
    const open = eq.assignments[0];
    if (open) assertCan(ctx, "update", "equipment_log", open.projectId);
    else assertCan(ctx, "update", "equipment_log");
    const to: EquipmentStatus = open ? "IN_USE" : "AVAILABLE";
    await tx.equipment.update({ where: { id: equipmentId }, data: { status: to } });
    await writeAudit(tx, ctx, { action: "STATUS_CHANGE", entity: "Equipment", entityId: equipmentId, projectId: open?.projectId ?? null, before: { status: eq.status }, after: { status: to } });
  });
}

export async function listEquipment(ctx: Ctx, f: { projectId?: string } = {}) {
  assertCan(ctx, "read", "equipment");
  const since = new Date(istToday(ctx.now).getTime() - 30 * 86_400_000);
  const rows = await db.equipment.findMany({
    include: {
      assignments: { where: { toDate: null }, include: { project: { select: { id: true, code: true, name: true } }, activity: { select: { code: true, name: true } } } },
      logs: { where: { logDate: { gte: since } }, select: { kind: true, hours: true, logDate: true } },
    },
    orderBy: { code: "asc" },
  });
  const allowed = new Set(ctx.projectIds);
  const visible = (pid: string) => ctx.allProjects || allowed.has(pid);
  return rows
    .map((e) => {
      const a = e.assignments[0] ?? null;
      const mine = a ? visible(a.projectId) : false;
      return {
        id: e.id, code: e.code, name: e.name, category: e.category, ownership: e.ownership, status: e.status,
        assignment: a ? (mine ? { projectId: a.projectId, projectCode: a.project.code, projectName: a.project.name, activity: a.activity ? `${a.activity.code} ${a.activity.name}` : null, since: dateKey(a.fromDate) } : { projectId: null, projectCode: "another project", projectName: "", activity: null, since: dateKey(a.fromDate) }) : null,
        onMyProject: mine,
        hours30: mine || !a ? e.logs.filter((l) => l.kind === "USAGE").reduce((s, l) => s + num(l.hours), 0) : 0,
        breakdowns30: e.logs.filter((l) => l.kind === "BREAKDOWN").length,
        canManage: a ? can(ctx, "create", "equipment_log", a.projectId) : can(ctx, "create", "equipment_log"),
      };
    })
    .filter((e) => (f.projectId ? e.assignment?.projectId === f.projectId : true));
}
export type EquipmentRow = Awaited<ReturnType<typeof listEquipment>>[number];

export async function getEquipment(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "equipment");
  const e = await db.equipment.findUnique({
    where: { id },
    include: {
      assignments: { include: { project: { select: { code: true, name: true } }, activity: { select: { code: true, name: true } } }, orderBy: { fromDate: "desc" }, take: 20 },
      logs: { include: { project: { select: { code: true } }, activity: { select: { name: true } }, loggedBy: { select: { name: true } } }, orderBy: [{ logDate: "desc" }, { createdAt: "desc" }], take: 40 },
    },
  });
  if (!e) throw notFound("That equipment");
  const allowed = new Set(ctx.projectIds);
  const visible = (pid: string) => ctx.allProjects || allowed.has(pid);
  const open = e.assignments.find((a) => a.toDate === null) ?? null;
  return {
    id: e.id, code: e.code, name: e.name, category: e.category, ownership: e.ownership, status: e.status,
    current: open && visible(open.projectId) ? { projectId: open.projectId, projectCode: open.project.code, projectName: open.project.name, activity: open.activity ? `${open.activity.code} ${open.activity.name}` : null, activityId: open.activityId, since: dateKey(open.fromDate) } : null,
    onOtherProject: !!open && !visible(open.projectId),
    assignments: e.assignments.filter((a) => visible(a.projectId)).map((a) => ({ id: a.id, project: `${a.project.code} ${a.project.name}`, activity: a.activity?.name ?? null, from: dateKey(a.fromDate), to: a.toDate ? dateKey(a.toDate) : null, note: a.note })),
    logs: e.logs.filter((l) => visible(l.projectId)).map((l) => ({ id: l.id, date: dateKey(l.logDate), kind: l.kind, hours: num(l.hours), project: l.project.code, activity: l.activity?.name ?? null, note: l.note, by: l.loggedBy.name })),
    canManage: open ? can(ctx, "create", "equipment_log", open.projectId) : can(ctx, "create", "equipment_log"),
  };
}
export type EquipmentDetail = Awaited<ReturnType<typeof getEquipment>>;
