/**
 * Demo seed. `resetDemo` deletes only records flagged isDemo and recreates them in one transaction.
 * Used by `pnpm db:seed`, the first-deploy hook, and the Owner's "Reset demo data" button.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, type PrismaClient, type ProjectStatus, type Role, type ActivityStatus } from "@prisma/client";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../../lib/demo-accounts";
import { ensureSequenceAtLeast } from "../common";
import {
  BOQ_EXTRAS, CHECKLISTS, COST_CODES, EMPLOYEES, EQUIPMENT, GANGS, MATERIALS, MATERIAL_CATEGORIES, SOPS,
  SUBCONTRACTORS, TEMPLATE, TRADES, UOMS, VENDORS,
} from "./data";

/** Bump when the demo data shape changes so deployed demos refresh themselves. */
export const SEED_VERSION = 2;
const META_KEY = "demoSeedVersion";

type Tx = Prisma.TransactionClient;

const DAY = 86400000;
const WEEK = 7 * DAY;
const pad = (n: number, w = 4) => String(n).padStart(w, "0");

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
const addDays = (d: Date, days: number) => new Date(d.getTime() + Math.round(days) * DAY);

export interface ProjectSeed {
  name: string;
  location: string;
  valueCr: number;
  status: ProjectStatus;
  pm: 1 | 2 | 3;
  engineer: number | null; // one Site Engineer per active project
  client: string;
  startedWeeksAgo: number;
  durationWeeks: number;
  slipWeeks: number; // currentFinish - baselineFinish
  stage: number; // work stage 0..1 on the template timeline (drives activity status now; DPR history in milestone 3)
  note: string;
}

export const PROJECTS: ProjectSeed[] = [
  { name: "G+2 luxury villa, RS Puram", location: "RS Puram, Coimbatore", valueCr: 3.4, status: "ACTIVE", pm: 1, engineer: 1, client: "R. Sundaram", startedWeeksAgo: 26, durationWeeks: 58, slipWeeks: 0, stage: 0.45, note: "~45% complete" },
  { name: "Duplex villa with basement, Avinashi Road", location: "Avinashi Road, Tiruppur", valueCr: 2.6, status: "ACTIVE", pm: 2, engineer: 2, client: "K. Palaniswamy", startedWeeksAgo: 14, durationWeeks: 60, slipWeeks: 8, stage: 0.2, note: "~20% complete, critical-path delay" },
  { name: "Contemporary villa, Saravanampatti", location: "Saravanampatti, Coimbatore", valueCr: 2.9, status: "ACTIVE", pm: 3, engineer: 3, client: "S. Lakshmi Narayanan", startedWeeksAgo: 40, durationWeeks: 52, slipWeeks: -3, stage: 0.7, note: "~70% complete, finishing stage, ahead" },
  { name: "Courtyard home, Race Course", location: "Race Course, Coimbatore", valueCr: 4.1, status: "ACTIVE", pm: 1, engineer: 4, client: "M. Vijayalakshmi", startedWeeksAgo: 30, durationWeeks: 60, slipWeeks: 0, stage: 0.55, note: "~55% complete, on track" },
  { name: "G+1 villa, Peelamedu", location: "Peelamedu, Coimbatore", valueCr: 2.3, status: "ACTIVE", pm: 2, engineer: 5, client: "T. Arumugam", startedWeeksAgo: 22, durationWeeks: 56, slipWeeks: 2, stage: 0.35, note: "~35% complete, slightly behind" },
  { name: "Luxury bungalow, Kumaran Nagar", location: "Kumaran Nagar, Tiruppur", valueCr: 3.0, status: "ACTIVE", pm: 1, engineer: 6, client: "P. Ganesan", startedWeeksAgo: 6, durationWeeks: 64, slipWeeks: 0, stage: 0.1, note: "~10% complete, foundation stage" },
  { name: "Villa with pool, Vadavalli", location: "Vadavalli, Coimbatore", valueCr: 3.6, status: "ACTIVE", pm: 3, engineer: 7, client: "N. Rajeshwari", startedWeeksAgo: 46, durationWeeks: 54, slipWeeks: 0, stage: 0.85, note: "~85% complete, one open major NCR" },
  { name: "Farmhouse residence, Pollachi", location: "Pollachi", valueCr: 2.2, status: "PLANNING", pm: 2, engineer: null, client: "V. Chinnasamy", startedWeeksAgo: -6, durationWeeks: 48, slipWeeks: 0, stage: 0, note: "planning" },
  { name: "Heritage-style home, Erode", location: "Erode", valueCr: 2.5, status: "ON_HOLD", pm: 3, engineer: null, client: "A. Thiagarajan", startedWeeksAgo: 4, durationWeeks: 70, slipWeeks: 12, stage: 0.05, note: "on hold — client-side approval pending" },
];

/** Delete every record flagged isDemo, children first. */
async function wipeDemo(tx: Tx) {
  const uIds = (await tx.user.findMany({ where: { isDemo: true }, select: { id: true } })).map((u) => u.id);
  const pIds = (await tx.project.findMany({ where: { isDemo: true }, select: { id: true } })).map((p) => p.id);

  await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: uIds } }, { projectId: { in: pIds } }] } });
  await tx.projectAssignment.deleteMany({ where: { OR: [{ userId: { in: uIds } }, { projectId: { in: pIds } }] } });
  await tx.project.deleteMany({ where: { isDemo: true } }); // cascades WBS, activities, BOQ, BOM, storage
  await tx.employee.deleteMany({ where: { isDemo: true } });
  await tx.contractLabourGang.deleteMany({ where: { isDemo: true } });
  await tx.subcontractor.deleteMany({ where: { isDemo: true } });
  await tx.material.deleteMany({ where: { isDemo: true } });
  await tx.materialCategory.deleteMany({ where: { isDemo: true } });
  await tx.uom.deleteMany({ where: { isDemo: true } });
  await tx.costCode.deleteMany({ where: { isDemo: true } });
  await tx.trade.deleteMany({ where: { isDemo: true } });
  await tx.vendor.deleteMany({ where: { isDemo: true } });
  await tx.equipment.deleteMany({ where: { isDemo: true } });
  await tx.qualityChecklist.deleteMany({ where: { isDemo: true } });
  await tx.sop.deleteMany({ where: { isDemo: true } });
  await tx.client.updateMany({ where: { isDemo: true }, data: { createdById: null } });
  await tx.user.deleteMany({ where: { isDemo: true } });
  await tx.client.deleteMany({ where: { isDemo: true } });
}

async function seedMasters(tx: Tx, ownerId: string) {
  const by = { isDemo: true, createdById: ownerId };

  const uom = new Map<string, string>();
  for (const [code, name] of UOMS) uom.set(code, (await tx.uom.create({ data: { code, name, ...by } })).id);

  const trade = new Map<string, string>();
  for (const name of TRADES) trade.set(name, (await tx.trade.create({ data: { name, ...by } })).id);

  const cc = new Map<string, string>();
  for (const [code, name] of COST_CODES) cc.set(code, (await tx.costCode.create({ data: { code, name, ...by } })).id);

  const cat = new Map<string, string>();
  for (const name of MATERIAL_CATEGORIES) cat.set(name, (await tx.materialCategory.create({ data: { name, ...by } })).id);

  const material = new Map<string, string>();
  let n = 0;
  for (const [name, category, u, cost, thr] of MATERIALS) {
    n += 1;
    const m = await tx.material.create({
      data: { code: `MAT-${pad(n)}`, name, categoryId: cat.get(category)!, uomId: uom.get(u)!, standardUnitCost: cost, reorderThreshold: thr, ...by },
    });
    material.set(name, m.id);
  }
  await ensureSequenceAtLeast(tx, "MAT", n);

  n = 0;
  for (const [name, category, contact, q, d, p, s] of VENDORS) {
    n += 1;
    await tx.vendor.create({ data: { code: `VEN-${pad(n)}`, name, category, contact, qualityRating: q, deliveryRating: d, priceRating: p, serviceRating: s, ...by } });
  }
  await ensureSequenceAtLeast(tx, "VEN", n);

  n = 0;
  for (const [name, t, contact] of SUBCONTRACTORS) {
    n += 1;
    await tx.subcontractor.create({ data: { code: `SUB-${pad(n)}`, name, tradeId: trade.get(t)!, contact, ...by } });
  }
  await ensureSequenceAtLeast(tx, "SUB", n);

  n = 0;
  for (const [name, category, ownership] of EQUIPMENT) {
    n += 1;
    await tx.equipment.create({ data: { code: `EQP-${pad(n)}`, name, category, ownership, ...by } });
  }
  await ensureSequenceAtLeast(tx, "EQP", n);

  n = 0;
  for (const [name, t, phone, wage] of EMPLOYEES) {
    n += 1;
    await tx.employee.create({ data: { code: `EMP-${pad(n)}`, name, tradeId: trade.get(t)!, phone, dailyWage: wage, ...by } });
  }
  await ensureSequenceAtLeast(tx, "EMP", n);

  n = 0;
  for (const [name, t, headcount, rate] of GANGS) {
    n += 1;
    await tx.contractLabourGang.create({ data: { code: `GNG-${pad(n)}`, name, tradeId: trade.get(t)!, headcount, ratePerManday: rate, ...by } });
  }
  await ensureSequenceAtLeast(tx, "GNG", n);

  n = 0;
  for (const c of CHECKLISTS) {
    n += 1;
    await tx.qualityChecklist.create({
      data: { code: `CHK-${pad(n)}`, name: c.name, description: c.description, ...by, items: { create: c.items.map((text, i) => ({ seq: i + 1, text })) } },
    });
  }
  await ensureSequenceAtLeast(tx, "CHK", n);

  n = 0;
  for (const [title, body] of SOPS) {
    n += 1;
    await tx.sop.create({ data: { code: `SOP-${pad(n)}`, title, body, ...by } });
  }
  await ensureSequenceAtLeast(tx, "SOP", n);

  return { uom, trade, cc, material };
}

interface Refs { uom: Map<string, string>; trade: Map<string, string>; cc: Map<string, string>; material: Map<string, string> }

/** Create WBS nodes, activities, BOQ, links, BOM and storage for one project. */
async function seedProjectPlan(tx: Tx, refs: Refs, project: { id: string; contractValue: number; start: Date; finish: Date; stage: number; status: ProjectStatus }, ownerId: string) {
  const by = { isDemo: true, createdById: ownerId };
  const scale = project.contractValue / 3e7;
  const budget = project.contractValue * 0.72;
  const shareSum = TEMPLATE.reduce((s, r) => s + r.share, 0);
  const durDays = Math.round((project.finish.getTime() - project.start.getTime()) / DAY);

  // WBS tree — created on demand from each template row's path.
  const wbsIds = new Map<string, string>();
  const wbsCodes = new Map<string, string>();
  const childSeq = new Map<string, number>();
  const wbsRows: Prisma.WbsNodeCreateManyInput[] = [];
  const leafFor = (path: string[]): string => {
    let parentKey = "";
    let parentId: string | null = null;
    let parentCode = "";
    for (const name of path) {
      const key = `${parentKey}/${name}`;
      if (!wbsIds.has(key)) {
        const seq = (childSeq.get(parentKey) ?? 0) + 1;
        childSeq.set(parentKey, seq);
        const code = parentCode ? `${parentCode}.${seq}` : `${seq}`;
        const id = randomUUID();
        wbsIds.set(key, id);
        wbsCodes.set(key, code);
        wbsRows.push({ id, projectId: project.id, parentId, code, name, seq, ...by });
      }
      parentId = wbsIds.get(key)!;
      parentCode = wbsCodes.get(key)!;
      parentKey = key;
    }
    return parentId!;
  };
  const leafIds = TEMPLATE.map((r) => leafFor(r.wbs));
  await tx.wbsNode.createMany({ data: wbsRows });

  // Activities.
  const actRows: Prisma.ActivityCreateManyInput[] = [];
  const bomRows: Prisma.MaterialBomCreateManyInput[] = [];
  const actIds: string[] = [];
  const actByName = new Map<string, { id: string; qty: number; cost: number; uom: string }>();
  TEMPLATE.forEach((r, i) => {
    const id = randomUUID();
    actIds.push(id);
    const decimals = r.uom === "nos" || r.uom === "kg" || r.qty >= 100 ? 0 : 1;
    const qty = Number((r.qty * scale).toFixed(decimals)) || 1;
    const cost = Math.round((budget * r.share) / shareSum);
    const start = addDays(project.start, r.ph[0] * durDays + (i % 3));
    const finish = addDays(project.start, r.ph[1] * durDays);
    let status: ActivityStatus = "NOT_STARTED";
    if (project.status !== "PLANNING") {
      if (r.ph[1] <= project.stage - 0.03) status = "COMPLETED";
      else if (r.ph[0] <= project.stage) status = "IN_PROGRESS";
    }
    actRows.push({
      id, code: `ACT-${pad(i + 1, 3)}`, projectId: project.id, wbsNodeId: leafIds[i], costCodeId: refs.cc.get(r.cc)!,
      tradeId: refs.trade.get(r.trade)!, uomId: refs.uom.get(r.uom)!, name: r.name, plannedQty: qty,
      plannedStart: start, plannedFinish: finish > start ? finish : addDays(start, 1),
      plannedMandays: Number((qty / r.prod).toFixed(2)), plannedCost: cost, targetProductivity: r.prod,
      criticalPath: r.crit, status, ...by,
    });
    actByName.set(r.name, { id, qty, cost, uom: r.uom });
    for (const [mat, coef, waste] of r.mats) {
      bomRows.push({ activityId: id, materialId: refs.material.get(mat)!, coefficient: coef, wastagePct: waste });
    }
  });
  await tx.activity.createMany({ data: actRows });
  await tx.materialBom.createMany({ data: bomRows });
  await ensureSequenceAtLeast(tx, `ACT:${project.id}`, TEMPLATE.length);

  // BOQ: one item per activity (client rate = internal rate + 32% margin), plus a few extra lines.
  const boqRows: Prisma.BoqItemCreateManyInput[] = [];
  const links: Prisma.ActivityBoqLinkCreateManyInput[] = [];
  const extraPaintQty = Math.round((actByName.get("Interior and exterior painting")?.qty ?? 0) * 0.24);
  TEMPLATE.forEach((r, i) => {
    const a = actByName.get(r.name)!;
    const id = randomUUID();
    const isPaint = r.name === "Interior and exterior painting";
    const qty = isPaint ? a.qty - extraPaintQty : a.qty;
    const internal = a.cost / a.qty;
    boqRows.push({
      id, projectId: project.id, itemCode: `B-${pad(i + 1, 3)}`, description: isPaint ? "Interior painting" : r.name,
      uomId: refs.uom.get(r.uom)!, originalQty: qty, approvedVariationQty: 0,
      clientRate: Number((internal * 1.32).toFixed(2)), internalBudgetRate: Number(internal.toFixed(2)), ...by,
    });
    links.push({ activityId: a.id, boqItemId: id });
  });
  for (const x of BOQ_EXTRAS) {
    const id = randomUUID();
    const isPaintExtra = !!x.linkActivity;
    const qty = isPaintExtra ? extraPaintQty : x.qty;
    const value = project.contractValue * x.valueShare;
    const rate = value / qty;
    boqRows.push({
      id, projectId: project.id, itemCode: x.code, description: x.description, uomId: refs.uom.get(x.uom)!,
      originalQty: qty, approvedVariationQty: 0, clientRate: Number(rate.toFixed(2)),
      internalBudgetRate: Number((rate * 0.82).toFixed(2)), ...by,
    });
    if (x.linkActivity) links.push({ activityId: actByName.get(x.linkActivity)!.id, boqItemId: id });
  }
  await tx.boqItem.createMany({ data: boqRows });
  await tx.activityBoqLink.createMany({ data: links });

  // Revision 1 = contract BOQ.
  const rev1 = await tx.boqRevision.create({ data: { projectId: project.id, number: 1, note: "Contract BOQ", ...by } });
  await tx.boqItemRevision.createMany({
    data: boqRows.map((b) => ({
      revisionId: rev1.id, boqItemId: b.id!, originalQty: b.originalQty, approvedVariationQty: b.approvedVariationQty ?? 0,
      clientRate: b.clientRate, internalBudgetRate: b.internalBudgetRate,
    })),
  });

  await tx.storageLocation.createMany({
    data: [
      { projectId: project.id, name: "Main Store", kind: "MAIN_STORE", ...by },
      { projectId: project.id, name: "Yard", kind: "YARD", ...by },
      { projectId: project.id, name: "Floor Store", kind: "FLOOR_STORE", ...by },
    ],
  });
  return { boqRows };
}

async function seedAll(tx: Tx) {
  const today = todayUtc();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const userIds = new Map<string, string>();
  for (const a of DEMO_ACCOUNTS) {
    const u = await tx.user.create({ data: { email: a.email, name: a.name, role: a.role as Role, passwordHash, isDemo: true } });
    userIds.set(a.email, u.id);
  }
  const ownerId = userIds.get("owner@buildflow.demo")!;
  const refs = await seedMasters(tx, ownerId);

  let n = 0;
  for (const p of PROJECTS) {
    n += 1;
    const code = pad(n);
    const client = await tx.client.create({
      data: { code: `CLI-${code}`, name: p.client, paymentTerms: "Milestone-linked (per contract)", isDemo: true, createdById: ownerId },
    });
    const start = new Date(today.getTime() - p.startedWeeksAgo * WEEK);
    const baselineFinish = new Date(start.getTime() + p.durationWeeks * WEEK);
    const contractValue = p.valueCr * 1e7;
    const project = await tx.project.create({
      data: {
        code: `PRJ-${code}`, clientId: client.id, name: p.name, type: "Premium residential villa", location: p.location,
        contractValue: contractValue.toFixed(2), baselineStart: start, baselineFinish,
        currentFinish: new Date(baselineFinish.getTime() + p.slipWeeks * WEEK), status: p.status, isDemo: true, createdById: ownerId,
      },
    });

    for (const email of [`pm${p.pm}@buildflow.demo`, ...(p.engineer ? [`engineer${p.engineer}@buildflow.demo`] : [])]) {
      await tx.projectAssignment.create({ data: { userId: userIds.get(email)!, projectId: project.id, createdById: ownerId, isDemo: true } });
    }
    if (n === 1) await tx.user.update({ where: { email: "client@buildflow.demo" }, data: { clientId: client.id } });

    const { boqRows } = await seedProjectPlan(tx, refs, { id: project.id, contractValue, start, finish: baselineFinish, stage: p.stage, status: p.status }, ownerId);

    // Vadavalli: an approved client variation → BOQ revision 2.
    if (p.name.includes("Vadavalli")) {
      const marble = boqRows.find((b) => b.description === "Italian marble flooring")!;
      const deck = boqRows.find((b) => b.description === "Teak wooden deck")!;
      await tx.boqItem.update({ where: { id: marble.id! }, data: { approvedVariationQty: 40 } });
      await tx.boqItem.update({ where: { id: deck.id! }, data: { approvedVariationQty: 25 } });
      const rev2 = await tx.boqRevision.create({ data: { projectId: project.id, number: 2, note: "Client variation: extra marble and pool-side deck", isDemo: true, createdById: ownerId } });
      const items = await tx.boqItem.findMany({ where: { projectId: project.id } });
      await tx.boqItemRevision.createMany({
        data: items.map((b) => ({
          revisionId: rev2.id, boqItemId: b.id, originalQty: b.originalQty, approvedVariationQty: b.approvedVariationQty,
          clientRate: b.clientRate, internalBudgetRate: b.internalBudgetRate,
        })),
      });
    }
  }
  await ensureSequenceAtLeast(tx, "CLI", n);
  await ensureSequenceAtLeast(tx, "PRJ", n);
  await tx.appMeta.upsert({ where: { key: META_KEY }, create: { key: META_KEY, value: String(SEED_VERSION) }, update: { value: String(SEED_VERSION) } });
  return { users: DEMO_ACCOUNTS.length, projects: PROJECTS.length };
}

/** Wipe and recreate all demo records atomically. */
export async function resetDemo(client: PrismaClient) {
  return client.$transaction(
    async (tx) => {
      await wipeDemo(tx);
      return seedAll(tx);
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

/**
 * First-deploy hook. Seeds when the database has no users, and — while DEMO_MODE is on — refreshes the demo
 * data when the seed version has moved on (so a deployed demo picks up new milestones' data without a click).
 */
export async function seedIfNeeded(client: PrismaClient, demoMode: boolean) {
  const users = await client.user.count();
  if (users === 0) return { action: "seeded" as const, ...(await resetDemo(client)) };
  if (!demoMode) return { action: "skipped" as const };
  const meta = await client.appMeta.findUnique({ where: { key: META_KEY } });
  if (!meta || Number(meta.value) < SEED_VERSION) return { action: "refreshed" as const, ...(await resetDemo(client)) };
  return { action: "skipped" as const };
}
