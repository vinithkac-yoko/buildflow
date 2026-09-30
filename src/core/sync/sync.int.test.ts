import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeSitePng } from "@/core/demo/ops";
import { istToday, dateKey } from "@/core/dates";
import { cleanupFixture, hasDb, makeFixture, type Fixture } from "@/test/factory";
import { processSyncItem, type SyncItem } from "./service";

describe.skipIf(!hasDb)("Offline sync (integration)", () => {
  const fixtures: Fixture[] = [];
  let uploads = "";
  beforeAll(() => { uploads = mkdtempSync(path.join(tmpdir(), "bf-sync-")); process.env.UPLOAD_DIR = uploads; });
  afterAll(async () => {
    for (const f of fixtures) await cleanupFixture(f);
    await db.$disconnect();
    rmSync(uploads, { recursive: true, force: true });
  });

  const fresh = async () => { const f = await makeFixture(); fixtures.push(f); return f; };
  const today = (f: Fixture) => dateKey(istToday(f.now));
  const report = (f: Fixture, over: Record<string, unknown> = {}) => ({
    weather: "SUNNY", noWork: false, remarks: null, progress: [{ activityId: f.actA.id, quantity: 20 }],
    labour: [{ activityId: f.actA.id, source: "CONTRACT_LABOUR", tradeId: f.trade.id, headcount: 4, hours: 8 }], materials: [], ...over,
  });
  const item = (f: Fixture, type: SyncItem["type"], clientTxnId: string, payload: unknown, extra: Partial<SyncItem> = {}): SyncItem => ({ clientTxnId, type, projectId: f.project.id, reportDate: today(f), payload, ...extra });

  it("saving a draft and submitting a report are idempotent: a retry never duplicates or fails", async () => {
    const f = await fresh();
    const a = await processSyncItem(f.ctx.se, item(f, "dpr.save", `dpr.save:${f.u}`, report(f)));
    const b = await processSyncItem(f.ctx.se, item(f, "dpr.save", `dpr.save:${f.u}`, report(f)));
    expect([a.status, b.status]).toEqual(["synced", "synced"]);
    expect(await db.dpr.count({ where: { projectId: f.project.id } })).toBe(1);
    expect(await db.dprActivityProgress.count({ where: { projectId: f.project.id } })).toBe(1);

    const s1 = await processSyncItem(f.ctx.se, item(f, "dpr.submit", `dpr.submit:${f.u}`, report(f)));
    expect(s1.status).toBe("synced");
    const s2 = await processSyncItem(f.ctx.se, item(f, "dpr.submit", `dpr.submit:${f.u}`, report(f))); // reply lost, phone retries
    expect(s2.status).toBe("synced");
    expect((await db.dpr.findFirstOrThrow({ where: { projectId: f.project.id } })).status).toBe("SUBMITTED");
    expect(await db.dprActivityProgress.count({ where: { projectId: f.project.id } })).toBe(1);
  });

  it("conflicts come back per item with a message: another engineer already submitted; a report for another day", async () => {
    const f = await fresh();
    await processSyncItem(f.ctx.se2, item(f, "dpr.submit", `dpr.submit:${f.u}:b`, report(f)));
    const late = await processSyncItem(f.ctx.se, item(f, "dpr.submit", `dpr.submit:${f.u}:a`, report(f, { progress: [{ activityId: f.actB.id, quantity: 5 }], labour: [] })));
    expect(late.status).toBe("conflict");
    expect(late.message).toMatch(/already submitted/);

    const old = await processSyncItem(f.ctx.se, item(f, "dpr.save", `dpr.save:${f.u}:old`, report(f), { reportDate: "2026-05-01" }));
    expect(old.status).toBe("conflict");
    expect(old.message).toMatch(/report of 2026-05-01.*only be filed for today/);
    const oldPhoto = await processSyncItem(f.ctx.se, item(f, "photo", `photo-${f.u}-old`, null, { reportDate: "2026-05-01" }), { buffer: makeSitePng(1), name: "a.png", type: "image/png" });
    expect(oldPhoto.status).toBe("conflict");
  });

  it("refusals are 'error' with the message (and field errors), never a silent drop", async () => {
    const f = await fresh();
    const noWeather = await processSyncItem(f.ctx.se, item(f, "dpr.submit", `dpr.submit:${f.u}:nw`, report(f, { weather: null })));
    expect(noWeather.status).toBe("error");
    expect(noWeather.message).toMatch(/weather/i);
    const tooMuch = await processSyncItem(f.ctx.se, item(f, "dpr.save", `dpr.save:${f.u}:big`, report(f, { progress: [{ activityId: f.actA.id, quantity: 999 }] })));
    expect(tooMuch.status).toBe("error");
    expect(tooMuch.message).toMatch(/left on/);
    const forbidden = await processSyncItem(f.ctx.client, item(f, "issue.add", `issue-${f.u}-c`, { title: "Nope", severity: "LOW" }));
    expect(forbidden.status).toBe("error");
    const unknown = await processSyncItem(f.ctx.se, { clientTxnId: "x-unknown-1", type: "delete.everything" as never, projectId: f.project.id });
    expect(unknown.status).toBe("error");
  });

  it("issues, material requests, inspection requests and photos are applied once per clientTxnId", async () => {
    const f = await fresh();
    const twice = async (it: SyncItem, file?: { buffer: Buffer; name: string; type: string }) => [await processSyncItem(f.ctx.se, it, file), await processSyncItem(f.ctx.se, it, file)].map((r) => r.status);

    expect(await twice(item(f, "issue.add", `issue-${f.u}-1`, { title: "Scaffold tie missing", severity: "HIGH" }))).toEqual(["synced", "synced"]);
    expect(await db.issue.count({ where: { projectId: f.project.id } })).toBe(1);

    expect(await twice(item(f, "mr.create", `mr-${f.u}-0001`, { items: [{ materialId: f.cement.id, quantity: 10 }] }))).toEqual(["synced", "synced"]);
    expect(await db.materialRequest.count({ where: { projectId: f.project.id } })).toBe(1);

    const list = await db.qualityChecklist.create({ data: { code: `SCK-${f.u}`, name: `Sync checklist ${f.u}`, items: { create: [{ seq: 1, text: "Check" }] } } });
    try {
      expect(await twice(item(f, "inspection.request", `insp-${f.u}-0001`, { activityId: f.actA.id, checklistId: list.id }))).toEqual(["synced", "synced"]);
      expect(await db.qualityInspection.count({ where: { projectId: f.project.id } })).toBe(1);

      expect(await twice(item(f, "photo", `photo-${f.u}-0001`, null), { buffer: makeSitePng(2), name: "site.png", type: "image/png" })).toEqual(["synced", "synced"]);
      expect(await db.dprPhoto.count({ where: { projectId: f.project.id } })).toBe(1);
    } finally {
      await db.qualityInspection.deleteMany({ where: { checklistId: list.id } });
      await db.qualityChecklist.delete({ where: { id: list.id } });
    }
  });
});
