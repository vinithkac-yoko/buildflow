import { z } from "zod";

/** Whole-report payload sent by the DPR screen (and, later, replayed by the offline outbox). */
export const WEATHER = ["SUNNY", "CLOUDY", "RAIN", "HEAVY_RAIN"] as const;
export const LABOUR_SOURCES = ["COMPANY_EMPLOYEE", "CONTRACT_LABOUR", "PIECE_RATE", "SUBCONTRACTOR"] as const;
export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const qty = (label: string) =>
  z.number({ invalid_type_error: `${label} must be a number.`, required_error: `Enter ${label}.` }).finite(`${label} must be a number.`);

export const progressLine = z.object({
  activityId: z.string().min(1, "Pick an activity."),
  quantity: qty("the quantity").min(0, "Quantity can't be negative."),
});

export const labourLine = z.object({
  activityId: z.string().min(1).nullish(),
  source: z.enum(LABOUR_SOURCES, { errorMap: () => ({ message: "Pick the labour source." }) }),
  tradeId: z.string().min(1, "Pick a trade."),
  subcontractorId: z.string().min(1).nullish(),
  headcount: qty("the headcount").int("Headcount must be a whole number.").min(1, "Headcount must be at least 1.").max(500, "Headcount looks too high — check it."),
  hours: qty("the hours").gt(0, "Hours must be more than 0.").max(16, "Hours can't be more than 16 in a day."),
});

export const materialLine = z.object({
  activityId: z.string().min(1, "Pick the activity this material was used on."),
  materialId: z.string().min(1, "Pick a material."),
  quantity: qty("the quantity").gt(0, "Quantity must be more than 0."),
});

export const dprInput = z.object({
  weather: z.enum(WEATHER).nullish(),
  remarks: z.string().trim().max(2000, "Remarks are too long.").nullish(),
  noWork: z.boolean().default(false),
  progress: z.array(progressLine).max(30, "Too many activities in one report."),
  labour: z.array(labourLine).max(80, "Too many labour lines in one report."),
  materials: z.array(materialLine).max(50, "Too many material lines in one report."),
  clientTxnId: z.string().min(8).max(64).nullish(),
});
export type DprInput = z.infer<typeof dprInput>;

export const issueInput = z.object({
  title: z.string().trim().min(3, "Describe the issue in a few words.").max(160, "Keep the title short."),
  severity: z.enum(SEVERITIES, { errorMap: () => ({ message: "Pick how serious it is." }) }),
  activityId: z.string().min(1).nullish(),
  description: z.string().trim().max(1000, "Keep the description under 1000 characters.").nullish(),
  targetResolutionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.").nullish(),
  clientTxnId: z.string().min(8).max(64).nullish(),
});
export type IssueInput = z.infer<typeof issueInput>;

export const WEATHER_LABEL: Record<(typeof WEATHER)[number], string> = {
  SUNNY: "Sunny", CLOUDY: "Cloudy", RAIN: "Rain", HEAVY_RAIN: "Heavy rain",
};
export const SOURCE_LABEL: Record<(typeof LABOUR_SOURCES)[number], string> = {
  COMPANY_EMPLOYEE: "Company", CONTRACT_LABOUR: "Contract", PIECE_RATE: "Piece rate", SUBCONTRACTOR: "Subcontractor",
};
export const SEVERITY_LABEL: Record<(typeof SEVERITIES)[number], string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical",
};
