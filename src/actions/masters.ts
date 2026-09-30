"use server";

import { toResult } from "@/core/common";
import { createMaster, updateMaster } from "@/core/masters/service";
import { getMaster } from "@/core/masters/registry";
import { requireSession } from "@/lib/auth";
import type { Values } from "@/lib/forms";

/** Create (id = null) or update a master record. Errors come back as field messages, never as a crash. */
export async function saveMasterAction(kind: string, id: string | null, values: Values) {
  const { ctx } = await requireSession();
  const label = getMaster(kind)?.label.toLowerCase() ?? "record";
  return toResult(() => (id ? updateMaster(ctx, kind, id, values) : createMaster(ctx, kind, values)), label);
}
