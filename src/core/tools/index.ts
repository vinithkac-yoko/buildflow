import { z } from "zod";
import { lowStockItems } from "../inventory/low-stock";
import { mandaysByProject } from "../dpr/labour";
import { behindActivities } from "../progress/behind";
import { listNcrs } from "../quality/ncr";
import { defineTool } from "./define";

const noInput = z.object({}).strict();

export const activitiesBehindSchedule = defineTool({
  name: "activities_behind_schedule",
  description: "Open activities in live projects that are 15 or more points behind their planned progress, critical path first.",
  input: z.object({ minBehindPoints: z.number().int().min(1).max(100).default(15) }),
  output: z.object({
    rows: z.array(z.object({
      projectId: z.string(), projectCode: z.string(), projectName: z.string(),
      activityId: z.string(), activityCode: z.string(), activityName: z.string(), criticalPath: z.boolean(),
      plannedPct: z.number(), actualPct: z.number(), behindPoints: z.number(), plannedFinish: z.string(),
    })),
  }),
  handler: async (ctx, input) => ({ rows: await behindActivities(ctx, input) }),
});

export const lowStock = defineTool({
  name: "low_stock",
  description: "Materials at or below their reorder level in live projects, summed across storage locations.",
  input: noInput,
  output: z.object({
    rows: z.array(z.object({
      projectId: z.string(), projectCode: z.string(), projectName: z.string(), materialId: z.string(),
      material: z.string(), unit: z.string(), quantity: z.number(), reorderThreshold: z.number(),
    })),
  }),
  handler: async (ctx) => ({ rows: await lowStockItems(ctx) }),
});

export const openNcrs = defineTool({
  name: "open_ncrs",
  description: "NCRs that are not yet closed, with those raised in the last 7 days flagged as new this week.",
  input: noInput,
  output: z.object({
    rows: z.array(z.object({
      id: z.string(), code: z.string(), projectId: z.string(), projectCode: z.string(), projectName: z.string(),
      severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]), status: z.string(), defect: z.string(),
      activity: z.string().nullable(), raisedAt: z.string(), newThisWeek: z.boolean(),
    })),
  }),
  handler: async (ctx) => {
    const weekAgo = ctx.now.getTime() - 7 * 86_400_000;
    const rows = await listNcrs(ctx, { open: true });
    return {
      rows: rows.map((n) => ({
        id: n.id, code: n.code, projectId: n.projectId, projectCode: n.projectCode, projectName: n.projectName,
        severity: n.severity, status: n.status, defect: n.defect, activity: n.activity, raisedAt: n.createdAt,
        newThisWeek: new Date(n.createdAt).getTime() >= weekAgo,
      })),
    };
  },
});

export const labourMandaysThisWeek = defineTool({
  name: "labour_mandays_this_week",
  description: "Mandays (headcount × hours ÷ 8) booked in submitted or approved daily reports over the last 7 days, per project.",
  input: noInput,
  output: z.object({
    rows: z.array(z.object({
      projectId: z.string(), projectCode: z.string(), projectName: z.string(),
      mandays: z.number(), workers: z.number(), reports: z.number(),
    })),
  }),
  handler: async (ctx) => ({ rows: await mandaysByProject(ctx) }),
});

/** The four questions Ask BUILDFlow offers, each backed by one tool. */
export const ASK_QUESTIONS = [
  { id: "behind", label: "Which activities are behind schedule?", tool: activitiesBehindSchedule },
  { id: "stock", label: "What's low on stock?", tool: lowStock },
  { id: "ncr", label: "Open NCRs this week?", tool: openNcrs },
  { id: "labour", label: "Labour mandays by project this week?", tool: labourMandaysThisWeek },
] as const;
export type AskQuestionId = (typeof ASK_QUESTIONS)[number]["id"];

export const TOOLS = ASK_QUESTIONS.map((q) => q.tool);
