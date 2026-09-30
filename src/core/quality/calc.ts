import type { InspectionOutcome, NcrStatus } from "@prisma/client";

/** Share of checkpoints that must pass for a conditional pass. Below it the inspection is rejected and an NCR is raised. */
export const CONDITIONAL_PASS_THRESHOLD = 0.8;

/**
 * Inspection result from the checkpoint counts:
 * every checkpoint passed → PASS; at least 80% passed → CONDITIONAL_PASS; otherwise REJECTED_NCR.
 */
export function inspectionResult(total: number, passed: number): InspectionOutcome {
  if (total <= 0) throw new Error("An inspection needs at least one checkpoint.");
  if (passed >= total) return "PASS";
  return passed / total >= CONDITIONAL_PASS_THRESHOLD - 1e-9 ? "CONDITIONAL_PASS" : "REJECTED_NCR";
}

export const RESULT_LABEL: Record<InspectionOutcome, string> = {
  PASS: "Pass", CONDITIONAL_PASS: "Conditional pass", REJECTED_NCR: "Rejected — NCR raised",
};

/** NCR life-cycle: Open → Corrective action → Rectification → Reinspection → Closed (a failed reinspection goes back to rectification). */
export const NCR_TRANSITIONS: Record<NcrStatus, readonly NcrStatus[]> = {
  OPEN: ["CORRECTIVE_ACTION"],
  CORRECTIVE_ACTION: ["RECTIFICATION"],
  RECTIFICATION: ["REINSPECTION"],
  REINSPECTION: ["CLOSED", "RECTIFICATION"],
  CLOSED: [],
};
export const canTransitionNcr = (from: NcrStatus, to: NcrStatus) => NCR_TRANSITIONS[from].includes(to);

export const NCR_STATUS_LABEL: Record<NcrStatus, string> = {
  OPEN: "Open", CORRECTIVE_ACTION: "Corrective action", RECTIFICATION: "Rectification", REINSPECTION: "Waiting for reinspection", CLOSED: "Closed",
};
export const NEXT_STEP: Record<NcrStatus, string> = {
  OPEN: "Agree the corrective action", CORRECTIVE_ACTION: "Do the rework and record it", RECTIFICATION: "Request reinspection",
  REINSPECTION: "Reinspect: pass to close, fail to send back", CLOSED: "Closed",
};
