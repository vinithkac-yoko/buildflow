import type { ProjectStatus } from "@prisma/client";

/** Allowed project status changes. COMPLETED and CANCELLED are final. */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  PLANNING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "DELAYED", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  DELAYED: ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return from === to || PROJECT_TRANSITIONS[from].includes(to);
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", DELAYED: "Delayed", COMPLETED: "Completed", CANCELLED: "Cancelled",
};
