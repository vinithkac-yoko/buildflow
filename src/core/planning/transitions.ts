import type { ActivityStatus } from "@prisma/client";

/** Allowed activity status changes. The DPR approval flow (milestone 3) also uses this map. */
export const ACTIVITY_TRANSITIONS: Record<ActivityStatus, readonly ActivityStatus[]> = {
  NOT_STARTED: ["IN_PROGRESS", "HALTED"],
  IN_PROGRESS: ["HALTED", "COMPLETED"],
  HALTED: ["IN_PROGRESS"],
  COMPLETED: ["IN_PROGRESS"], // reopen after a rejected inspection or a quantity correction
};

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  NOT_STARTED: "Not started", IN_PROGRESS: "In progress", HALTED: "Halted", COMPLETED: "Completed",
};

export function canTransitionActivity(from: ActivityStatus, to: ActivityStatus): boolean {
  return from === to || ACTIVITY_TRANSITIONS[from].includes(to);
}
