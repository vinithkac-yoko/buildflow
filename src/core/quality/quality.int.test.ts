import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { buildCtx } from "@/core/auth/ctx";
import { db } from "@/lib/db";
import { AppError } from "@/core/errors";
import { portfolioProgress } from "@/core/progress/service";
import { cleanupFixture, hasDb, makeFixture, type Fixture } from "@/test/factory";
import { completeInspection, getInspection, listInspections, requestInspection } from "./inspections";
import { completeReinspection, getNcr, listNcrs, recordReworkCost, recordRectification, requestReinspection, startCorrectiveAction } from "./ncr";

async function expectError(p: Promise<unknown>, re: RegExp) {
  await expect(p).rejects.toSatisfy((e: unknown) => (e instanceof AppError ? re.test(e.message) : false));
}

describe.skipIf(!hasDb)("Flow C — quality (integration)", () => {
  const fixtures: Fixture[] = [];
  const extra: { checklists: string[]; subs: string[]; trades: string[] } = { checklists: [], subs: [], trades: [] };
  afterAll(async () => {
    for (const f of fixtures) await cleanupFixture(f);
    await db.qualityChecklist.deleteMany({ where: { id: { in: extra.checklists } } });
    await db.subcontractor.deleteMany({ where: { id: { in: extra.subs } } });
    await db.trade.deleteMany({ where: { id: { in: extra.trades } } });
    await db.$disconnect();
  });

  async function setup() {
    const f = await makeFixture();
    fixtures.push(f);
    let n = 0;
    const mk = async (role: Role, assign: boolean) => {
      const user = await db.user.create({ data: { email: `${role.toLowerCase()}-q${++n}-${f.u}@test.local`, name: `${role} ${f.u}`, passwordHash: "x", role } });
      if (assign) await db.projectAssignment.create({ data: { userId: user.id, projectId: f.project.id } });
      return buildCtx(user, f.now);
    };
    const qe = await mk("QUALITY_ENGINEER", true);
    const outsiderQe = await mk("QUALITY_ENGINEER", false);
    const list = await db.qualityChecklist.create({
      data: { code: `TCK-${f.u}`, name: `Test checklist ${f.u}`, items: { create: Array.from({ length: 5 }, (_, i) => ({ seq: i + 1, text: `Checkpoint ${i + 1}` })) } },
      include: { items: true },
    });
    extra.checklists.push(list.id);
    const subTrade = await db.trade.create({ data: { name: `Sub trade ${f.u}` } });
    extra.trades.push(subTrade.id);
    const sub = await db.subcontractor.create({ data: { code: `TSUB-${f.u}`, name: `Test sub ${f.u}`, tradeId: subTrade.id } });
    extra.subs.push(sub.id);
    const answers = (fails: number[] = []) => list.items.map((i) => ({ seq: i.seq, passed: !fails.includes(i.seq) }));
    return { f, qe, outsiderQe, list, sub, answers };
  }

  it("site engineer requests, inspector completes: all pass gives PASS and no NCR", async () => {
    const { f, qe, list, answers } = await setup();
    const reqId = await requestInspection(f.ctx.se, f.project.id, { activityId: f.actA.id, checklistId: list.id, note: "Ready" });
    expect((await getInspection(qe, reqId)).status).toBe("REQUESTED");
    await expectError(completeInspection(f.ctx.se, f.project.id, { requestId: reqId, activityId: f.actA.id, checklistId: list.id, results: answers() }), /access/i);

    const res = await completeInspection(qe, f.project.id, { requestId: reqId, activityId: f.actA.id, checklistId: list.id, results: answers() });
    expect(res.result).toBe("PASS");
    expect(res.ncrId).toBeNull();
    const done = await getInspection(qe, reqId);
    expect(done.passed).toBe(5);
    expect(done.inspector).toContain("QUALITY_ENGINEER");
    await expectError(completeInspection(qe, f.project.id, { requestId: reqId, activityId: f.actA.id, checklistId: list.id, results: answers() }), /already completed/);
  });

  it("every checkpoint must be answered", async () => {
    const { f, qe, list, answers } = await setup();
    await expectError(completeInspection(qe, f.project.id, { activityId: f.actA.id, checklistId: list.id, results: answers().slice(0, 3) }), /Answer every checkpoint/);
    await expectError(completeInspection(qe, f.project.id, { activityId: f.actA.id, checklistId: list.id, results: [...answers(), { seq: 9, passed: true }] }), /don't belong|twice|Some answers/);
  });

  it("one failed checkpoint is a conditional pass (no NCR)", async () => {
    const { f, qe, list, answers } = await setup();
    const res = await completeInspection(qe, f.project.id, { activityId: f.actA.id, checklistId: list.id, results: answers([2]) });
    expect(res.result).toBe("CONDITIONAL_PASS");
    expect(res.ncrId).toBeNull();
  });

  it("a rejection raises an NCR linked to the inspection and the subcontractor, and replaying does not duplicate it", async () => {
    const { f, qe, list, sub, answers } = await setup();
    const body = { activityId: f.actA.id, checklistId: list.id, results: answers([1, 2, 3]), subcontractorId: sub.id, severity: "CRITICAL", clientTxnId: `txn-${f.u}-quality` };
    const res = await completeInspection(qe, f.project.id, body);
    expect(res.result).toBe("REJECTED_NCR");
    expect(res.ncrId).toBeTruthy();
    const again = await completeInspection(qe, f.project.id, body);
    expect(again.inspectionId).toBe(res.inspectionId);
    expect(again.ncrId).toBe(res.ncrId);
    expect(await db.ncr.count({ where: { projectId: f.project.id } })).toBe(1);

    const ncr = await getNcr(qe, res.ncrId!);
    expect(ncr.severity).toBe("CRITICAL");
    expect(ncr.subcontractor).toContain("Test sub");
    expect(ncr.defect).toContain("Failed 3 of 5");
    expect(ncr.status).toBe("OPEN");
    expect(ncr.actions.map((a) => a.step)).toEqual(["RAISED"]);
  });

  it("the NCR follows corrective action → rectification → reinspection → closure, in order, and records closure time", async () => {
    const { f, qe, list, answers } = await setup();
    const { ncrId } = await completeInspection(qe, f.project.id, { activityId: f.actA.id, checklistId: list.id, results: answers([1, 2, 3, 4]) });
    const id = ncrId!;

    await expectError(recordRectification(qe, id, { note: "Fixed it", timeLostDays: 1 }), /isn't available/);
    await expectError(requestReinspection(qe, id), /isn't available/);
    await expect(startCorrectiveAction(qe, id, { action: "no" })).rejects.toThrow(/corrective action/i);
    await startCorrectiveAction(qe, id, { action: "Redo the work to the specification" });
    await recordRectification(qe, id, { note: "Rebuilt two courses", timeLostDays: 2 });
    await requestReinspection(qe, id);
    await completeReinspection(qe, id, { passed: false, note: "Still out of plumb" });
    expect((await getNcr(qe, id)).status).toBe("RECTIFICATION");
    await recordRectification(qe, id, { note: "Corrected the plumb", timeLostDays: 1 });
    await requestReinspection(qe, id);
    await completeReinspection(qe, id, { passed: true });

    const closed = await getNcr(f.ctx.pm, id);
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedAt).toBeTruthy();
    expect(closed.closureHours).toBeGreaterThanOrEqual(1);
    expect(closed.actions.map((a) => a.step)).toEqual(["RAISED", "CORRECTIVE_ACTION", "RECTIFICATION", "REINSPECTION_REQUESTED", "REINSPECTION_FAILED", "RECTIFICATION", "REINSPECTION_REQUESTED", "CLOSED"]);
    await expectError(startCorrectiveAction(qe, id, { action: "Again please, thanks" }), /already closed/);
    // The database keeps status and closure time in step.
    await expect(db.$executeRaw`UPDATE "Ncr" SET status = 'CLOSED', "closedAt" = NULL WHERE id = ${id}`).rejects.toThrow();
  });

  it("rework cost is cost data: only the Owner and the project's PM can record or see it", async () => {
    const { f, qe, list, answers } = await setup();
    const { ncrId } = await completeInspection(qe, f.project.id, { activityId: f.actA.id, checklistId: list.id, results: answers([1, 2, 3, 4]) });
    await expectError(recordReworkCost(qe, ncrId!, { labour: 100, material: 50 }), /access/i);
    await expectError(recordReworkCost(f.ctx.outsiderPm, ncrId!, { labour: 100, material: 50 }), /access/i);
    await recordReworkCost(f.ctx.pm, ncrId!, { labour: 12000, material: 3500 });

    expect((await getNcr(f.ctx.pm, ncrId!)).reworkLabourCost).toBe(12000);
    expect((await getNcr(f.ctx.owner, ncrId!)).reworkMaterialCost).toBe(3500);
    const asQe = JSON.stringify(await getNcr(qe, ncrId!));
    expect(asQe).not.toContain("reworkLabourCost");
    expect(asQe).not.toContain("reworkMaterialCost");
    expect(JSON.stringify(await listNcrs(qe, {}))).not.toContain("reworkLabourCost");
    await expect(db.ncr.update({ where: { id: ncrId! }, data: { reworkLabourCost: -1 } })).rejects.toThrow();
  });

  it("access: outside inspectors and clients can't read; the PM can read but not move an NCR", async () => {
    const { f, qe, outsiderQe, list, answers } = await setup();
    const { inspectionId, ncrId } = await completeInspection(qe, f.project.id, { activityId: f.actA.id, checklistId: list.id, results: answers([1, 2, 3, 4]) });
    await expectError(getInspection(outsiderQe, inspectionId), /access/i);
    await expectError(getNcr(f.ctx.client, ncrId!), /access/i);
    expect(await listInspections(outsiderQe, { projectId: f.project.id })).toEqual([]);
    expect((await getNcr(f.ctx.pm, ncrId!)).canStep).toBe(false);
    await expectError(startCorrectiveAction(f.ctx.pm, ncrId!, { action: "Please fix it soon" }), /access/i);
  });

  it("an open major NCR lowers the project's health score", async () => {
    const { f, qe, list, answers } = await setup();
    const before = (await portfolioProgress(f.ctx.owner)).projects.find((p) => p.projectId === f.project.id)!.health!;
    await completeInspection(qe, f.project.id, { activityId: f.actA.id, checklistId: list.id, results: answers([1, 2, 3, 4]), severity: "MAJOR" });
    const p = (await portfolioProgress(f.ctx.owner)).projects.find((x) => x.projectId === f.project.id)!;
    expect(p.health!.ncr).toBe(before.ncr - 10);
    expect((await portfolioProgress(f.ctx.owner)).attention.some((a) => a.kind === "NCR" && a.projectId === f.project.id)).toBe(true);
  });
});
