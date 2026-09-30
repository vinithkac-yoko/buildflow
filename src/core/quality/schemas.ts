import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const num = (label: string) => z.number({ invalid_type_error: `${label} must be a number.`, required_error: `Enter ${label}.` }).finite(`${label} must be a number.`);
const text = (label: string, min = 3, max = 500) => z.string({ required_error: `Enter ${label}.` }).trim().min(min, `Enter ${label} (a few words).`).max(max, `Keep ${label} shorter.`);

export const SEVERITIES = ["MINOR", "MAJOR", "CRITICAL"] as const;
export const SEVERITY_LABEL: Record<(typeof SEVERITIES)[number], string> = { MINOR: "Minor", MAJOR: "Major", CRITICAL: "Critical" };

export const inspectionRequestInput = z.object({
  activityId: z.string().min(1, "Pick the activity to inspect."),
  checklistId: z.string().min(1, "Pick the checklist."),
  note: z.string().trim().max(300).nullish(),
  clientTxnId: z.string().min(8).max(64).nullish(),
});

export const inspectionInput = z.object({
  requestId: z.string().min(1).nullish(),
  activityId: z.string().min(1, "Pick the activity being inspected."),
  checklistId: z.string().min(1, "Pick the checklist."),
  inspectionDate: dateStr.nullish(),
  results: z.array(z.object({ seq: z.number().int().min(1), passed: z.boolean(), note: z.string().trim().max(300).nullish() })).min(1, "Answer every checkpoint."),
  remarks: z.string().trim().max(1000).nullish(),
  subcontractorId: z.string().min(1).nullish(),
  /** Used only when the result is a rejection: how serious the defect is, and what it is. */
  severity: z.enum(SEVERITIES).nullish(),
  defect: z.string().trim().max(500).nullish(),
  clientTxnId: z.string().min(8).max(64).nullish(),
});
export type InspectionInput = z.infer<typeof inspectionInput>;

export const correctiveActionInput = z.object({ action: text("the corrective action", 5) });
export const rectificationInput = z.object({
  note: text("what was done to fix it", 5),
  timeLostDays: num("the time lost in days").min(0, "Time lost can't be negative.").max(365, "That is more than a year — check the number."),
});
export const reinspectionInput = z.object({ passed: z.boolean({ required_error: "Choose pass or fail." }), note: z.string().trim().max(500).nullish() });
export const reworkCostInput = z.object({
  labour: num("the rework labour cost").min(0, "Cost can't be negative.").max(1e9),
  material: num("the rework material cost").min(0, "Cost can't be negative.").max(1e9),
});
