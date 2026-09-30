/**
 * Demo quality data: inspections spread over the last weeks on every active site, one closed NCR with its cost and
 * closure time, one open major NCR (Vadavalli), and one inspection request waiting for the Quality Engineer.
 */
import type { NcrSeverity, NcrStatus, Prisma } from "@prisma/client";
import { addDays } from "../dates";
import { nextCode } from "../common";
import { inspectionResult } from "../quality/calc";

type Tx = Prisma.TransactionClient;

export interface QualitySeedInput {
  today: Date;
  now: Date;
  userIds: Map<string, string>;
  projects: { index: number; id: string; pmEmail: string; engineerEmail: string | null }[];
}

interface Plan {
  project: number;
  checklist: "Pre-concrete pour" | "Brickwork" | "Plastering";
  activity: string;
  daysAgo: number;
  /** 1-based checkpoint numbers that fail. */
  fails?: number[];
  requested?: boolean;
  ncr?: { severity: NcrSeverity; status: NcrStatus; defect?: string; sub?: string };
}

const PLAN: Plan[] = [
  { project: 1, checklist: "Pre-concrete pour", activity: "Footing concrete RMC M25", daysAgo: 30 },
  { project: 1, checklist: "Brickwork", activity: "AAC block masonry – ground floor", daysAgo: 12, fails: [8] },
  { project: 1, checklist: "Brickwork", activity: "AAC block masonry – ground floor", daysAgo: 5 },
  { project: 1, checklist: "Brickwork", activity: "AAC block masonry – first floor", daysAgo: 0, requested: true },
  { project: 2, checklist: "Pre-concrete pour", activity: "Footing concrete RMC M25", daysAgo: 20, fails: [4] },
  { project: 3, checklist: "Brickwork", activity: "AAC block masonry – ground floor", daysAgo: 25 },
  { project: 3, checklist: "Plastering", activity: "Internal plastering", daysAgo: 10 },
  { project: 4, checklist: "Pre-concrete pour", activity: "Footing concrete RMC M25", daysAgo: 40 },
  { project: 4, checklist: "Brickwork", activity: "AAC block masonry – ground floor", daysAgo: 30, fails: [1, 2, 3, 4], ncr: { severity: "MINOR", status: "CLOSED", defect: "Wall alignment and joints out of tolerance on the ground-floor east wall; rebuilt two courses.", sub: "Murugan Plastering & Finishes" } },
  { project: 5, checklist: "Brickwork", activity: "AAC block masonry – ground floor", daysAgo: 15 },
  { project: 6, checklist: "Pre-concrete pour", activity: "Footing concrete RMC M25", daysAgo: 6 },
  { project: 7, checklist: "Plastering", activity: "Internal plastering", daysAgo: 40 },
  { project: 7, checklist: "Plastering", activity: "Internal plastering", daysAgo: 4, fails: [3, 4, 5, 6], ncr: { severity: "MAJOR", status: "CORRECTIVE_ACTION", sub: "Murugan Plastering & Finishes" } },
];

export async function seedQuality(tx: Tx, input: QualitySeedInput) {
  const checklists = await tx.qualityChecklist.findMany({ where: { isDemo: true }, include: { items: { orderBy: { seq: "asc" } } } });
  const subs = new Map((await tx.subcontractor.findMany({ where: { isDemo: true }, select: { id: true, name: true } })).map((s) => [s.name, s.id]));
  const qe = input.userIds.get("quality@buildflow.demo")!;
  const pmOwner = input.userIds.get("owner@buildflow.demo")!;
  const at = (daysAgo: number, hour = 11) => new Date(addDays(input.today, -daysAgo).getTime() + hour * 3_600_000);

  for (const pl of PLAN) {
    const p = input.projects.find((x) => x.index === pl.project);
    const list = checklists.find((c) => c.name === pl.checklist);
    if (!p || !list) continue;
    const act = await tx.activity.findFirst({ where: { projectId: p.id, name: pl.activity }, select: { id: true, status: true } });
    if (!act || (act.status === "NOT_STARTED" && !pl.requested)) continue;

    const fails = new Set(pl.fails ?? []);
    const total = list.items.length;
    const passed = list.items.filter((i) => !fails.has(i.seq)).length;
    const done = at(pl.daysAgo);
    const subId = pl.ncr?.sub ? subs.get(pl.ncr.sub) ?? null : null;
    const requester = p.engineerEmail ? input.userIds.get(p.engineerEmail)! : pmOwner;

    if (pl.requested) {
      await tx.qualityInspection.create({
        data: {
          code: await nextCode(tx, "INS"), projectId: p.id, activityId: act.id, checklistId: list.id, status: "REQUESTED", requestedById: requester,
          requestNote: "Block work on the first floor is ready for checking", createdAt: at(0, 9), isDemo: true,
        },
      });
      continue;
    }
    const result = inspectionResult(total, passed);
    const insp = await tx.qualityInspection.create({
      data: {
        code: await nextCode(tx, "INS"), projectId: p.id, activityId: act.id, checklistId: list.id, status: "COMPLETED", inspectionDate: addDays(input.today, -pl.daysAgo),
        requestedById: pl.daysAgo % 2 === 0 ? requester : null, inspectorId: qe, subcontractorId: subId, totalCheckpoints: total, passedCheckpoints: passed, result,
        remarks: result === "CONDITIONAL_PASS" ? "Minor point to fix before the next stage." : null, createdAt: done, completedAt: done, isDemo: true,
        results: { create: list.items.map((i) => ({ seq: i.seq, text: i.text, passed: !fails.has(i.seq), note: fails.has(i.seq) ? "Not as specified — to be corrected" : null })) },
      },
    });
    if (!pl.ncr) continue;

    const failed = list.items.filter((i) => fails.has(i.seq));
    const defect = pl.ncr.defect ?? `Failed ${failed.length} of ${total} checkpoints on ${list.name}: ${failed.map((f) => f.text).join("; ")}`;
    const closed = pl.ncr.status === "CLOSED";
    const raisedAt = done;
    const ncr = await tx.ncr.create({
      data: {
        code: await nextCode(tx, "NCR"), projectId: p.id, activityId: act.id, inspectionId: insp.id, subcontractorId: subId, severity: pl.ncr.severity, defect: defect.slice(0, 500),
        status: pl.ncr.status, raisedById: qe, createdAt: raisedAt, isDemo: true,
        correctiveAction: "Remove the defective work, redo it to the specification and re-check before the next stage.",
        ...(closed
          ? { rectificationNote: "Two courses taken down and rebuilt with the specified adhesive; alignment re-checked.", timeLostDays: 1, reworkLabourCost: 12500, reworkMaterialCost: 6000, closedAt: at(pl.daysAgo - 3, 15), closureHours: 76 }
          : {}),
      },
    });
    const steps: [string, string | null, number][] = [["RAISED", `From inspection — ${passed} of ${total} checkpoints passed`, pl.daysAgo]];
    steps.push(["CORRECTIVE_ACTION", "Remove the defective work, redo it to the specification and re-check before the next stage.", pl.daysAgo - 1]);
    if (closed) {
      steps.push(["RECTIFICATION", "Two courses taken down and rebuilt with the specified adhesive; alignment re-checked. (time lost: 1 day)", pl.daysAgo - 2]);
      steps.push(["REINSPECTION_REQUESTED", null, pl.daysAgo - 2], ["CLOSED", "Reinspection passed", pl.daysAgo - 3]);
    }
    for (const [step, note, d] of steps) await tx.ncrAction.create({ data: { ncrId: ncr.id, step, note, userId: qe, createdAt: at(d, 14) } });
  }
}
