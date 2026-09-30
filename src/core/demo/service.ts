import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { forbidden, validation } from "../errors";
import type { Ctx } from "../types";
import { resetDemo } from "./seed";

/** Owner-only. Recreates all demo records (and demo users — everyone signs in again). Never runs unless DEMO_MODE=true. */
export async function resetDemoData(ctx: Ctx) {
  if (!isDemoMode()) throw validation("Demo mode is off, so demo data can't be reset.");
  if (ctx.role !== "OWNER") throw forbidden("Only the Owner can reset demo data.");
  try {
    return await resetDemo(db);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      throw validation("Some records that are not marked DEMO still refer to demo data (for example a real project under a demo client), so the reset was stopped and nothing was changed. Move or remove those records first.");
    }
    throw e;
  }
}
