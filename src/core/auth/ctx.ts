import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { Ctx } from "../types";
import { ALL_PROJECT_ROLES } from "./permissions";

/** Build the execution context for a user: which projects they can touch, and as whom. */
export async function buildCtx(
  user: { id: string; role: Role; clientId: string | null },
  now: Date = new Date(),
): Promise<Ctx> {
  const allProjects = ALL_PROJECT_ROLES.includes(user.role);
  let projectIds: string[] = [];
  if (!allProjects) {
    if (user.role === "CLIENT") {
      if (user.clientId) {
        const rows = await db.project.findMany({ where: { clientId: user.clientId }, select: { id: true } });
        projectIds = rows.map((r) => r.id);
      }
    } else if (user.role !== "MARKETING") {
      const rows = await db.projectAssignment.findMany({ where: { userId: user.id }, select: { projectId: true } });
      projectIds = rows.map((r) => r.projectId);
    }
  }
  return { userId: user.id, role: user.role, projectIds, allProjects, clientId: user.clientId, now };
}
