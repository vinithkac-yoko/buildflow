import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError } from "@/core/errors";
import { makePdf } from "@/core/demo/ops";
import { approveDpr, submitDpr } from "@/core/dpr/service";
import { createDocument, decideDocument } from "@/core/documents/service";
import { locateDprPhoto } from "@/core/dpr/photos";
import { cleanupFixture, hasDb, makeFixture, type Fixture } from "@/test/factory";
import { clientPortal, portfolioProgress } from "./service";

async function expectError(p: Promise<unknown>, re: RegExp) {
  await expect(p).rejects.toSatisfy((e: unknown) => (e instanceof AppError ? re.test(e.message) : false));
}

describe.skipIf(!hasDb)("Client portal (integration)", () => {
  const fixtures: Fixture[] = [];
  let uploads = "";
  beforeAll(() => { uploads = mkdtempSync(path.join(tmpdir(), "bf-client-")); process.env.UPLOAD_DIR = uploads; });
  afterAll(async () => {
    for (const f of fixtures) await cleanupFixture(f);
    await db.$disconnect();
    rmSync(uploads, { recursive: true, force: true });
  });

  it("shows approved progress, shared photos and released documents only — nothing internal", async () => {
    const f = await makeFixture();
    fixtures.push(f);

    // A submitted (not approved) report changes nothing for the client.
    const sub = await submitDpr(f.ctx.se, f.project.id, {
      weather: "SUNNY", noWork: false, remarks: "INTERNAL remark", progress: [{ activityId: f.actA.id, quantity: 30 }],
      labour: [{ activityId: f.actA.id, source: "CONTRACT_LABOUR", tradeId: f.trade.id, headcount: 5, hours: 8 }], materials: [],
    });
    let view = await clientPortal(f.ctx.client, f.project.id);
    expect(view.actualPct).toBe(0);
    expect(view.updates).toHaveLength(0);
    expect(view.lastUpdate).toBeNull();

    // After approval the progress and the update appear; a photo only when the PM has shared it.
    await approveDpr(f.ctx.pm, sub.dprId);
    const shared = await db.dprPhoto.create({ data: { dprId: sub.dprId, projectId: f.project.id, fileKey: `k-${f.u}-1.png`, originalName: "a.png", mimeType: "image/png", sizeBytes: 10, uploadedById: f.users.se.id, clientVisible: true } });
    const hidden = await db.dprPhoto.create({ data: { dprId: sub.dprId, projectId: f.project.id, fileKey: `k-${f.u}-2.png`, originalName: "b.png", mimeType: "image/png", sizeBytes: 10, uploadedById: f.users.se.id, clientVisible: false } });
    view = await clientPortal(f.ctx.client, f.project.id);
    expect(view.actualPct).toBeGreaterThan(0);
    expect(view.updates).toHaveLength(1);
    expect(view.updates[0].workedOn).toEqual([f.actA.name]);
    expect(view.updates[0].photoIds).toEqual([shared.id]);
    expect(view.photoCount).toBe(1);
    await expect(locateDprPhoto(f.ctx.client, shared.id)).resolves.toBeTruthy();
    await expectError(locateDprPhoto(f.ctx.client, hidden.id), /not found/);

    // Documents: only released ones, and only their current version.
    const docId = await createDocument(f.ctx.pm, f.project.id, { category: "HANDOVER", title: "Handover pack" }, { buffer: makePdf("pack"), name: "pack.pdf" });
    expect((await clientPortal(f.ctx.client, f.project.id)).documents).toHaveLength(0);
    await decideDocument(f.ctx.pm, docId, "APPROVE");
    await decideDocument(f.ctx.pm, docId, "RELEASE");
    expect((await clientPortal(f.ctx.client, f.project.id)).documents.map((d) => d.title)).toEqual(["Handover pack"]);

    // Nothing internal is in what the client receives: no plan, days behind, health, issues, NCRs, delays, money or remarks.
    const json = JSON.stringify(view) + JSON.stringify(await clientPortal(f.ctx.client, f.project.id));
    for (const banned of ["plannedPct", "daysAheadBehind", "health", "band", "openIssues", "ncr", "delay", "Cost", "cost", "Rate", "rate", "contractValue", "INTERNAL"]) {
      expect(json, banned).not.toContain(banned);
    }
  });

  it("another client, engineers and outside PMs can't open it; the client gets no portfolio", async () => {
    const f = await makeFixture();
    fixtures.push(f);
    const other = await makeFixture();
    fixtures.push(other);
    await expectError(clientPortal(f.ctx.client, other.project.id), /not found|access/i);
    await expectError(portfolioProgress(f.ctx.client), /portfolio view is for/);
    await expectError(portfolioProgress(f.ctx.se), /portfolio view is for/);
    await expectError(clientPortal(f.ctx.outsiderPm, f.project.id), /not found|access/i);
  });
});
