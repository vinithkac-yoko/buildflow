import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "../audit";
import { assertCan } from "../auth/permissions";
import { zText, demoFlag } from "../common";
import type { Ctx } from "../types";

export const STORAGE_KIND_LABEL = {
  MAIN_STORE: "Main Store", YARD: "Yard", FLOOR_STORE: "Floor Store", WAREHOUSE: "Warehouse", OTHER: "Other",
} as const;

const input = z.object({
  name: zText("the location name", 80),
  kind: z.enum(["MAIN_STORE", "YARD", "FLOOR_STORE", "WAREHOUSE", "OTHER"], { errorMap: () => ({ message: "Pick the storage type." }) }),
});

export async function listStorage(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "storage_location", projectId);
  return db.storageLocation.findMany({ where: { projectId }, orderBy: { name: "asc" } });
}

export async function createStorage(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "create", "storage_location", projectId);
  const i = input.parse(raw);
  return db.$transaction(async (tx) => {
    const s = await tx.storageLocation.create({ data: { ...i, projectId, createdById: ctx.userId, ...demoFlag() } });
    await writeAudit(tx, ctx, { action: "CREATE", entity: "StorageLocation", entityId: s.id, projectId, after: { name: s.name, kind: s.kind } });
    return s.id;
  });
}
