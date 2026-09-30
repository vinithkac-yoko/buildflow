import type { ProjectStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, canSeeField } from "../auth/permissions";
import { nextCode, zDate, zId, zNum, zText, demoFlag } from "../common";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";
import { PROJECT_TRANSITIONS, PROJECT_STATUS_LABEL, canTransition } from "./transitions";

const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "DELAYED", "COMPLETED", "CANCELLED"] as const;

export const projectInput = z
  .object({
    name: zText("the project name"),
    clientId: zId("a client"),
    type: zText("the project type", 80),
    location: zText("the location"),
    contractValue: zNum("Contract value", { gt: 0 }),
    baselineStart: zDate("the start date"),
    baselineFinish: zDate("the baseline finish date"),
    currentFinish: zDate("the current finish date"),
  })
  .refine((v) => v.baselineFinish > v.baselineStart, { path: ["baselineFinish"], message: "Finish date must be after the start date." })
  .refine((v) => v.currentFinish > v.baselineStart, { path: ["currentFinish"], message: "Current finish must be after the start date." });

export type ProjectInput = z.infer<typeof projectInput>;

const snap = (o: object) => JSON.parse(JSON.stringify(o)) as Record<string, string>;

/** Owner creates projects (creating one sets the contract value, which is cost data). */
export async function createProject(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "project");
  const input = projectInput.parse(raw);
  return db.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw validation("Pick a valid client.");
    const code = await nextCode(tx, "PRJ");
    const p = await tx.project.create({
      data: { ...input, code, status: "PLANNING", createdById: ctx.userId, ...demoFlag() },
    });
    // Every project starts with a main store so the first receipt has somewhere to land.
    await tx.storageLocation.create({ data: { projectId: p.id, name: "Main Store", kind: "MAIN_STORE", createdById: ctx.userId, ...demoFlag() } });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "Project", entityId: p.id, projectId: p.id, after: snap(p) });
    return p.id;
  });
}

/** Update project facts. Only roles that may see contract value can change it; Admin's edit leaves it untouched. */
export async function updateProject(ctx: Ctx, projectId: string, raw: Record<string, unknown>) {
  assertCan(ctx, "update", "project", projectId);
  const canValue = canSeeField(ctx, "contractValue", projectId) && ctx.role !== "CLIENT";
  const existing = await db.project.findUnique({ where: { id: projectId } });
  if (!existing) throw notFound("That project");
  const merged = {
    ...raw,
    clientId: existing.clientId, // a project's client never changes after creation
    contractValue: canValue ? raw.contractValue : existing.contractValue.toString(),
  };
  const input = projectInput.parse(merged);
  return db.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: projectId }, data: input });
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: "Project", entityId: projectId, projectId, before: snap(existing), after: snap(p),
    });
    return p.id;
  });
}

export async function changeProjectStatus(ctx: Ctx, projectId: string, to: ProjectStatus) {
  assertCan(ctx, "update", "project", projectId);
  if (!STATUSES.includes(to)) throw validation("Pick a valid status.");
  return db.$transaction(async (tx) => {
    const p = await tx.project.findUnique({ where: { id: projectId } });
    if (!p) throw notFound("That project");
    if (!canTransition(p.status, to)) {
      const allowed = PROJECT_TRANSITIONS[p.status].map((s) => PROJECT_STATUS_LABEL[s]).join(", ") || "none — it is final";
      throw conflict(`A ${PROJECT_STATUS_LABEL[p.status]} project can't move to ${PROJECT_STATUS_LABEL[to]}. Allowed next steps: ${allowed}.`);
    }
    if (p.status === to) return p.id;
    await tx.project.update({ where: { id: projectId }, data: { status: to } });
    await writeAudit(tx, ctx, {
      action: "STATUS_CHANGE", entity: "Project", entityId: projectId, projectId,
      before: { status: p.status }, after: { status: to },
    });
    return p.id;
  });
}
