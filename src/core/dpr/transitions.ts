import type { DprStatus } from "@prisma/client";

/** DPR life-cycle. REJECTED goes back to DRAFT when the engineer edits it, and can then be resubmitted. */
export const DPR_TRANSITIONS: Record<DprStatus, readonly DprStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: ["DRAFT", "SUBMITTED"],
};

export const DPR_STATUS_LABEL: Record<DprStatus, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", APPROVED: "Approved", REJECTED: "Rejected",
};

export const canTransitionDpr = (from: DprStatus, to: DprStatus) => from === to || DPR_TRANSITIONS[from].includes(to);

/** Only these states can be edited by the site team. */
export const isEditable = (s: DprStatus) => s === "DRAFT" || s === "REJECTED";
