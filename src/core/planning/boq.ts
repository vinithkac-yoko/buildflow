import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan, redact } from "../auth/permissions";
import { zId, zOptText, zNum, zText, demoFlag } from "../common";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";

export const boqInput = z.object({
  itemCode: zText("the item code", 30),
  description: zText("the description", 300),
  uomId: zId("a unit"),
  originalQty: zNum("Original quantity", { min: 0 }),
  approvedVariationQty: zNum("Approved variation quantity"),
  clientRate: zNum("Client rate", { min: 0 }),
  internalBudgetRate: zNum("Internal budget rate", { min: 0 }),
});

const snap = (o: object) => JSON.parse(JSON.stringify(o)) as Record<string, string>;

export async function listBoq(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "boq", projectId);
  const [items, revisions] = await Promise.all([
    db.boqItem.findMany({
      where: { projectId },
      include: {
        uom: { select: { id: true, code: true } },
        activityLinks: { include: { activity: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { itemCode: "asc" },
    }),
    db.boqRevision.findMany({ where: { projectId }, orderBy: { number: "desc" }, select: { id: true, number: true, note: true, createdAt: true } }),
  ]);
  return {
    revisions,
    items: items.map((b) =>
      redact(ctx, {
        id: b.id, projectId: b.projectId, itemCode: b.itemCode, description: b.description, uom: b.uom,
        originalQty: b.originalQty.toString(), approvedVariationQty: b.approvedVariationQty.toString(),
        clientRate: b.clientRate.toString(), internalBudgetRate: b.internalBudgetRate.toString(),
        activities: b.activityLinks.map((l) => l.activity),
      }, projectId),
    ),
  };
}

export type BoqListItem = Awaited<ReturnType<typeof listBoq>>["items"][number];

export async function createBoqItem(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "boq", projectId);
  const i = boqInput.parse(raw);
  return db.$transaction(async (tx) => {
    if (!(await tx.uom.findUnique({ where: { id: i.uomId } }))) throw validation("Pick a valid unit.");
    if (await tx.boqItem.findUnique({ where: { projectId_itemCode: { projectId, itemCode: i.itemCode } } })) {
      throw conflict(`Item code ${i.itemCode} already exists in this project's BOQ.`);
    }
    const b = await tx.boqItem.create({ data: { ...i, projectId, createdById: ctx.userId, ...demoFlag() } });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "BoqItem", entityId: b.id, projectId, after: snap(b) });
    return b.id;
  });
}

export async function updateBoqItem(ctx: Ctx, boqItemId: string, raw: unknown) {
  const i = boqInput.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.boqItem.findUnique({ where: { id: boqItemId } });
    if (!before) throw notFound("That BOQ item");
    assertCan(ctx, "update", "boq", before.projectId);
    if (!(await tx.uom.findUnique({ where: { id: i.uomId } }))) throw validation("Pick a valid unit.");
    if (i.itemCode !== before.itemCode && (await tx.boqItem.findUnique({ where: { projectId_itemCode: { projectId: before.projectId, itemCode: i.itemCode } } }))) {
      throw conflict(`Item code ${i.itemCode} already exists in this project's BOQ.`);
    }
    const b = await tx.boqItem.update({ where: { id: boqItemId }, data: i });
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: "BoqItem", entityId: boqItemId, projectId: b.projectId, before: snap(before), after: snap(b),
    });
    return b.id;
  });
}

/** Freeze the current BOQ as a numbered revision (e.g. after an approved client variation). */
export async function createBoqRevision(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "update", "boq", projectId);
  const { note } = z.object({ note: zOptText(300) }).parse(raw);
  return db.$transaction(async (tx) => {
    const items = await tx.boqItem.findMany({ where: { projectId } });
    if (items.length === 0) throw validation("Add BOQ items before saving a revision.");
    const last = await tx.boqRevision.aggregate({ where: { projectId }, _max: { number: true } });
    const number = (last._max.number ?? 0) + 1;
    const rev = await tx.boqRevision.create({
      data: {
        projectId, number, note: note ?? null, createdById: ctx.userId, ...demoFlag(),
        rows: {
          create: items.map((b) => ({
            boqItemId: b.id, originalQty: b.originalQty, approvedVariationQty: b.approvedVariationQty,
            clientRate: b.clientRate, internalBudgetRate: b.internalBudgetRate,
          })),
        },
      },
    });
    await writeAudit(tx, ctx, {
      action: "CREATE", entity: "BoqRevision", entityId: rev.id, projectId, after: { number, items: items.length, note: note ?? "" },
    });
    return rev.id;
  });
}

export async function linkActivityBoq(ctx: Ctx, activityId: string, boqItemId: string) {
  return db.$transaction(async (tx) => {
    const [a, b] = await Promise.all([
      tx.activity.findUnique({ where: { id: activityId } }),
      tx.boqItem.findUnique({ where: { id: boqItemId } }),
    ]);
    if (!a) throw notFound("That activity");
    if (!b || b.projectId !== a.projectId) throw validation("Pick a BOQ item from the same project.");
    assertCan(ctx, "update", "activity", a.projectId);
    if (await tx.activityBoqLink.findUnique({ where: { activityId_boqItemId: { activityId, boqItemId } } })) {
      throw conflict("That BOQ item is already linked to this activity.");
    }
    const link = await tx.activityBoqLink.create({ data: { activityId, boqItemId } });
    await writeAudit(tx, ctx, {
      action: "LINK", entity: "ActivityBoqLink", entityId: link.id, projectId: a.projectId, activityId,
      after: { activity: a.code, boqItem: b.itemCode },
    });
  });
}

export async function unlinkActivityBoq(ctx: Ctx, activityId: string, boqItemId: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.activity.findUnique({ where: { id: activityId } });
    if (!a) throw notFound("That activity");
    assertCan(ctx, "update", "activity", a.projectId);
    const link = await tx.activityBoqLink.findUnique({ where: { activityId_boqItemId: { activityId, boqItemId } } });
    if (!link) return;
    await tx.activityBoqLink.delete({ where: { id: link.id } });
    await writeAudit(tx, ctx, { action: "UNLINK", entity: "ActivityBoqLink", entityId: link.id, projectId: a.projectId, activityId });
  });
}

export async function boqOptions(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "activity", projectId);
  const items = await db.boqItem.findMany({ where: { projectId }, select: { id: true, itemCode: true, description: true }, orderBy: { itemCode: "asc" } });
  return items.map((b) => ({ value: b.id, label: `${b.itemCode} — ${b.description}` }));
}
