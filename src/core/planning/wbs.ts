import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan } from "../auth/permissions";
import { zOptId, zText, demoFlag } from "../common";
import { conflict, notFound, validation } from "../errors";
import type { Ctx } from "../types";

export interface WbsRow {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  seq: number;
  activityCount: number;
  childCount: number;
}

export async function listWbs(ctx: Ctx, projectId: string): Promise<WbsRow[]> {
  assertCan(ctx, "read", "wbs", projectId);
  const nodes = await db.wbsNode.findMany({
    where: { projectId },
    include: { _count: { select: { activities: true, children: true } } },
  });
  const rows = nodes.map((n) => ({
    id: n.id, parentId: n.parentId, code: n.code, name: n.name, seq: n.seq,
    activityCount: n._count.activities, childCount: n._count.children,
  }));
  // Natural order of hierarchical codes: 1, 1.1, 1.2, 2, 2.1 …
  return rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

const createInput = z.object({ name: zText("the WBS name", 120), parentId: zOptId() });

export async function createWbsNode(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "wbs", projectId);
  const input = createInput.parse(raw);
  return db.$transaction(async (tx) => {
    let parentCode: string | null = null;
    if (input.parentId) {
      const parent = await tx.wbsNode.findUnique({ where: { id: input.parentId } });
      if (!parent || parent.projectId !== projectId) throw validation("Pick a parent from this project.");
      parentCode = parent.code;
    }
    const siblings = await tx.wbsNode.aggregate({
      where: { projectId, parentId: input.parentId ?? null },
      _max: { seq: true },
    });
    const seq = (siblings._max.seq ?? 0) + 1;
    const code = parentCode ? `${parentCode}.${seq}` : `${seq}`;
    const node = await tx.wbsNode.create({
      data: { projectId, parentId: input.parentId ?? null, code, name: input.name, seq, createdById: ctx.userId, ...demoFlag() },
    });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "WbsNode", entityId: node.id, projectId, after: { code, name: input.name } });
    return node.id;
  });
}

export async function renameWbsNode(ctx: Ctx, nodeId: string, raw: unknown) {
  const input = z.object({ name: zText("the WBS name", 120) }).parse(raw);
  return db.$transaction(async (tx) => {
    const node = await tx.wbsNode.findUnique({ where: { id: nodeId } });
    if (!node) throw notFound("That WBS item");
    assertCan(ctx, "update", "wbs", node.projectId);
    await tx.wbsNode.update({ where: { id: nodeId }, data: { name: input.name } });
    await writeAudit(tx, ctx, {
      action: "UPDATE", entity: "WbsNode", entityId: nodeId, projectId: node.projectId,
      before: { name: node.name }, after: { name: input.name },
    });
  });
}

export async function deleteWbsNode(ctx: Ctx, nodeId: string) {
  return db.$transaction(async (tx) => {
    const node = await tx.wbsNode.findUnique({
      where: { id: nodeId },
      include: { _count: { select: { children: true, activities: true } } },
    });
    if (!node) throw notFound("That WBS item");
    assertCan(ctx, "delete", "wbs", node.projectId);
    if (node._count.children > 0) throw conflict("Remove or move the items under this WBS item first.");
    if (node._count.activities > 0) throw conflict("This WBS item has activities. Move or remove them first.");
    await tx.wbsNode.delete({ where: { id: nodeId } });
    await writeAudit(tx, ctx, {
      action: "DELETE", entity: "WbsNode", entityId: nodeId, projectId: node.projectId,
      before: { code: node.code, name: node.name },
    });
  });
}
