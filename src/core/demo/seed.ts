/**
 * Demo seed. `resetDemo` deletes only records flagged isDemo and recreates them in one transaction.
 * Used by `pnpm db:seed`, the first-deploy hook, and the Owner's "Reset demo data" button.
 */
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Prisma, type PrismaClient, type ProjectStatus, type Role } from "@prisma/client";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../../lib/demo-accounts";
import { ensureSequenceAtLeast } from "../common";
import { istToday } from "../dates";
import { seedHistory, type HistoryAct } from "./history";
import { seedProcurement } from "./procurement";
import { seedQuality } from "./quality";
import { solveFront } from "./solver";
import {
  BOQ_EXTRAS, CHECKLISTS, COST_CODES, EMPLOYEES, EQUIPMENT, GANGS, MATERIALS, MATERIAL_CATEGORIES, SOPS,
  SUBCONTRACTORS, TEMPLATE, TRADES, UOMS, VENDORS,
} from "./data";

/** Bump when the demo data shape changes so deployed demos refresh themselves. */
export const SEED_VERSION = 5;
const META_KEY = "demoSeedVersion";

type Tx = Prisma.TransactionClient;

const DAY = 86400000;
const WEEK = 7 * DAY;
const pad = (n: number, w = 4) => String(n).padStart(w, "0");

const todayUtc = () => istToday(new Date());
const addDays = (d: Date, days: number) => new Date(d.getTime() + Math.round(days) * DAY);

export interface ProjectSeed {
  name: string;
  location: string;
  valueCr: number;
  status: ProjectStatus;
  pm: 1 | 2 | 3;
  engineer: number | null; // one Site Engineer per active project
  client: string;
  durationWeeks: number;
  slipWeeks: number; // currentFinish - baselineFinish
  /** Planned % complete today and actual % complete at the last approved report — chosen so each site tells a different story. */
  plannedNow: number;
  actualNow: number;
  /** Days since the project's start when planned/actual are as above are solved from the template; planning projects start in the future. */
  startsInWeeks?: number;
  lastApprovedOffset: 0 | 1 | 2;
  pendingToday?: boolean;
  lowStock?: string;
  note: string;
}

export const PROJECTS: ProjectSeed[] = [
  { name: "G+2 luxury villa, RS Puram", location: "RS Puram, Coimbatore", valueCr: 3.4, status: "ACTIVE", pm: 1, engineer: 1, client: "R. Sundaram", durationWeeks: 58, slipWeeks: 0, plannedNow: 44, actualNow: 45, lastApprovedOffset: 1, note: "~45% complete, on track (no report yet today — the engineer demo)" },
  { name: "Duplex villa with basement, Avinashi Road", location: "Avinashi Road, Tiruppur", valueCr: 2.6, status: "ACTIVE", pm: 2, engineer: 2, client: "K. Palaniswamy", durationWeeks: 60, slipWeeks: 8, plannedNow: 31, actualNow: 20, lastApprovedOffset: 2, note: "~20% complete, clearly behind on the critical path, no report yesterday" },
  { name: "Contemporary villa, Saravanampatti", location: "Saravanampatti, Coimbatore", valueCr: 2.9, status: "ACTIVE", pm: 3, engineer: 3, client: "S. Lakshmi Narayanan", durationWeeks: 52, slipWeeks: -3, plannedNow: 62, actualNow: 70, lastApprovedOffset: 1, pendingToday: true, note: "~70% complete, finishing stage, ahead; today's report waits for approval" },
  { name: "Courtyard home, Race Course", location: "Race Course, Coimbatore", valueCr: 4.1, status: "ACTIVE", pm: 1, engineer: 4, client: "M. Vijayalakshmi", durationWeeks: 60, slipWeeks: 0, plannedNow: 54, actualNow: 55, lastApprovedOffset: 0, note: "~55% complete, on track, today's report approved" },
  { name: "G+1 villa, Peelamedu", location: "Peelamedu, Coimbatore", valueCr: 2.3, status: "ACTIVE", pm: 2, engineer: 5, client: "T. Arumugam", durationWeeks: 56, slipWeeks: 2, plannedNow: 40, actualNow: 35, lastApprovedOffset: 1, pendingToday: true, note: "~35% complete, slightly behind; today's report waits for approval" },
  { name: "Luxury bungalow, Kumaran Nagar", location: "Kumaran Nagar, Tiruppur", valueCr: 3.0, status: "ACTIVE", pm: 1, engineer: 6, client: "P. Ganesan", durationWeeks: 64, slipWeeks: 0, plannedNow: 9, actualNow: 10, lastApprovedOffset: 1, note: "~10% complete, foundation stage" },
  { name: "Villa with pool, Vadavalli", location: "Vadavalli, Coimbatore", valueCr: 3.6, status: "ACTIVE", pm: 3, engineer: 7, client: "N. Rajeshwari", durationWeeks: 54, slipWeeks: 0, plannedNow: 86, actualNow: 85, lastApprovedOffset: 0, lowStock: "Premium emulsion paint", note: "~85% complete, one open major NCR (milestone 5), paint stock low" },
  { name: "Farmhouse residence, Pollachi", location: "Pollachi", valueCr: 2.2, status: "PLANNING", pm: 2, engineer: null, client: "V. Chinnasamy", durationWeeks: 48, slipWeeks: 0, plannedNow: 0, actualNow: 0, startsInWeeks: 6, lastApprovedOffset: 0, note: "planning" },
  { name: "Heritage-style home, Erode", location: "Erode", valueCr: 2.5, status: "ON_HOLD", pm: 3, engineer: null, client: "A. Thiagarajan", durationWeeks: 70, slipWeeks: 12, plannedNow: 8, actualNow: 5, lastApprovedOffset: 2, note: "on hold — client-side approval pending" },
];

/** Delete every record flagged isDemo, children first. */
async function wipeDemo(tx: Tx) {
  // The inventory ledger is append-only; only this transaction is allowed to delete demo rows (see invariants.sql).
  await tx.$executeRaw`SELECT set_config('bf.allow_ledger_delete', 'on', true)`;
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
  const subByTrade = new Map<string, string>();
  for (const [name, t, contact] of SUBCONTRACTORS) {
    n += 1;
    const sub = await tx.subcontractor.create({ data: { code: `SUB-${pad(n)}`, name, tradeId: trade.get(t)!, contact, ...by } });
    if (!subByTrade.has(t)) subByTrade.set(t, sub.id);
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

  // Average daily wage per trade (employees and gangs), used to cost the demo labour history.
  const wageByTradeId = new Map<string, number>();
  const samples = new Map<string, number[]>();
  for (const [, t, , wage] of EMPLOYEES) samples.set(t, [...(samples.get(t) ?? []), wage]);
  for (const [, t, , , rate] of GANGS.map((g) => [g[0], g[1], g[2], g[2], g[3]] as const)) samples.set(t, [...(samples.get(t) ?? []), rate]);
  for (const [t, v] of samples) wageByTradeId.set(trade.get(t)!, v.reduce((a, b) => a + b, 0) / v.length);

  return { uom, trade, cc, material, subByTrade, wageByTradeId };
}

interface Refs {
  uom: Map<string, string>; trade: Map<string, string>; cc: Map<string, string>; material: Map<string, string>;
  subByTrade: Map<string, string>; wageByTradeId: Map<string, number>;
}

/** Create WBS nodes, activities, BOQ, links, BOM and storage for one project. */
async function seedProjectPlan(tx: Tx, refs: Refs, project: { id: string; contractValue: number; start: Date; finish: Date }, ownerId: string) {
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
  const histActs: HistoryAct[] = [];
  TEMPLATE.forEach((r, i) => {
    const id = randomUUID();
    actIds.push(id);
    const decimals = r.uom === "nos" || r.uom === "kg" || r.qty >= 100 ? 0 : 1;
    const qty = Number((r.qty * scale).toFixed(decimals)) || 1;
    const cost = Math.round((budget * r.share) / shareSum);
    const start = addDays(project.start, r.ph[0] * durDays + (i % 3));
    const finish = addDays(project.start, r.ph[1] * durDays);
    actRows.push({
      id, code: `ACT-${pad(i + 1, 3)}`, projectId: project.id, wbsNodeId: leafIds[i], costCodeId: refs.cc.get(r.cc)!,
      tradeId: refs.trade.get(r.trade)!, uomId: refs.uom.get(r.uom)!, name: r.name, plannedQty: qty,
      plannedStart: start, plannedFinish: finish > start ? finish : addDays(start, 1),
      plannedMandays: Number((qty / r.prod).toFixed(2)), plannedCost: cost, targetProductivity: r.prod,
      criticalPath: r.crit, status: "NOT_STARTED", ...by,
    });
    actByName.set(r.name, { id, qty, cost, uom: r.uom });
    histActs.push({ id, row: r, plannedQty: qty, prod: r.prod });
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

  const mainStoreId = randomUUID();
  const yardId = randomUUID();
  await tx.storageLocation.createMany({
    data: [
      { id: mainStoreId, projectId: project.id, name: "Main Store", kind: "MAIN_STORE", ...by },
      { id: yardId, projectId: project.id, name: "Yard", kind: "YARD", ...by },
      { projectId: project.id, name: "Floor Store", kind: "FLOOR_STORE", ...by },
    ],
  });
  return { boqRows, acts: histActs, bomRows, mainStoreId, yardId };
}

const ISSUES: Record<number, { title: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; status: "OPEN" | "IN_PROGRESS" | "RESOLVED"; ageDays: number; activity?: string }[]> = {
  1: [
    { title: "Rebar for first-floor slab arriving two days late", severity: "MEDIUM", status: "OPEN", ageDays: 2, activity: "Slab and beams – first floor" },
    { title: "Site gate hinge broken", severity: "LOW", status: "RESOLVED", ageDays: 9 },
  ],
  2: [
    { title: "Basement excavation flooded — dewatering pump needed", severity: "CRITICAL", status: "OPEN", ageDays: 3, activity: "Earthwork excavation for foundation" },
    { title: "Shoring design approval pending from structural consultant", severity: "HIGH", status: "IN_PROGRESS", ageDays: 6 },
  ],
  3: [{ title: "Paint shade approval pending from client", severity: "LOW", status: "OPEN", ageDays: 4, activity: "Interior and exterior painting" }],
  4: [{ title: "Marble batch shade variation between pallets", severity: "MEDIUM", status: "OPEN", ageDays: 1 }],
  5: [{ title: "Electrician gang unavailable this week", severity: "HIGH", status: "OPEN", ageDays: 2, activity: "Conduit and wiring" }],
  6: [{ title: "Boundary marking disputed by neighbour", severity: "MEDIUM", status: "IN_PROGRESS", ageDays: 5 }],
  7: [
    { title: "Pool corner waterproofing test showed seepage", severity: "HIGH", status: "OPEN", ageDays: 2, activity: "Terrace and wet-area waterproofing" },
    { title: "Tile adhesive stock running low", severity: "LOW", status: "RESOLVED", ageDays: 12 },
  ],
};

async function seedIssues(tx: Tx, a: { projectId: string; index: number; engineerId: string; acts: HistoryAct[]; today: Date }) {
  for (const i of ISSUES[a.index] ?? []) {
    const seq = await tx.codeSequence.upsert({ where: { key: "ISS" }, create: { key: "ISS", value: 1 }, update: { value: { increment: 1 } } });
    const created = new Date(a.today.getTime() - i.ageDays * DAY + 5 * 3_600_000);
    await tx.issue.create({
      data: {
        code: `ISS-${pad(seq.value)}`, projectId: a.projectId, title: i.title, severity: i.severity, status: i.status,
        activityId: i.activity ? a.acts.find((x) => x.row.name === i.activity)?.id ?? null : null,
        reportedById: a.engineerId, targetResolutionDate: new Date(created.getTime() + 7 * DAY), createdAt: created,
        resolvedAt: i.status === "RESOLVED" ? new Date(created.getTime() + 2 * DAY) : null, isDemo: true,
      },
    });
  }
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
  const materialInfo = new Map(
    MATERIALS.map(([name, , , cost, thr]) => [refs.material.get(name)!, { id: refs.material.get(name)!, name, threshold: thr, unitCost: cost }] as const),
  );

  let n = 0;
  const procurementProjects: Parameters<typeof seedProcurement>[1]["projects"] = [];
  for (const p of PROJECTS) {
    n += 1;
    const code = pad(n);
    const client = await tx.client.create({
      data: { code: `CLI-${code}`, name: p.client, paymentTerms: "Milestone-linked (per contract)", isDemo: true, createdById: ownerId },
    });
    // Solve the start date so that planned % today is exactly what this site's story needs.
    const durDays = p.durationWeeks * 7;
    const tFrac = p.startsInWeeks ? 0 : solveFront(TEMPLATE, p.plannedNow);
    const start = p.startsInWeeks ? new Date(today.getTime() + p.startsInWeeks * WEEK) : new Date(today.getTime() - Math.round(tFrac * durDays) * DAY);
    const baselineFinish = new Date(start.getTime() + p.durationWeeks * WEEK);
    const contractValue = p.valueCr * 1e7;
    const project = await tx.project.create({
      data: {
        code: `PRJ-${code}`, clientId: client.id, name: p.name, type: "Premium residential villa", location: p.location,
        contractValue: contractValue.toFixed(2), baselineStart: start, baselineFinish,
        currentFinish: new Date(baselineFinish.getTime() + p.slipWeeks * WEEK), status: p.status, isDemo: true, createdById: ownerId,
      },
    });

    for (const email of [`pm${p.pm}@buildflow.demo`, ...(p.engineer ? [`engineer${p.engineer}@buildflow.demo`] : []), ...(p.status === "ACTIVE" ? ["store@buildflow.demo", "quality@buildflow.demo"] : [])]) {
      await tx.projectAssignment.create({ data: { userId: userIds.get(email)!, projectId: project.id, createdById: ownerId, isDemo: true } });
    }
    if (n === 1) await tx.user.update({ where: { email: "client@buildflow.demo" }, data: { clientId: client.id } });

    const { boqRows, acts, bomRows, mainStoreId, yardId } = await seedProjectPlan(tx, refs, { id: project.id, contractValue, start, finish: baselineFinish }, ownerId);

    if (p.status === "ACTIVE") procurementProjects.push({ index: n, id: project.id, pmEmail: `pm${p.pm}@buildflow.demo`, engineerEmail: p.engineer ? `engineer${p.engineer}@buildflow.demo` : null, mainStoreId });

    // Approved DPR history with labour, material issues and a consistent stock ledger.
    if (p.plannedNow > 0 || p.actualNow > 0) {
      const engineerId = userIds.get(`engineer${p.engineer ?? 1}@buildflow.demo`)!;
      const result = await seedHistory(tx, {
        projectId: project.id, projectIndex: n, start, today, now: new Date(), frontNow: solveFront(TEMPLATE, p.actualNow),
        lastApprovedOffset: p.lastApprovedOffset, pendingToday: !!p.pendingToday, engineerId,
        pmId: userIds.get(`pm${p.pm}@buildflow.demo`)!, acts,
        bom: bomRows.map((b) => ({ activityId: b.activityId, materialId: b.materialId, coefficient: Number(b.coefficient), wastagePct: Number(b.wastagePct ?? 0) })),
        materials: materialInfo, mainStoreId, yardId, tradeIds: refs.trade, subByTrade: refs.subByTrade, wageByTradeId: refs.wageByTradeId,
        lowStockMaterial: p.lowStock, halted: p.status === "ON_HOLD",
      });
      for (const [activityId, f] of result.activityFinal) {
        await tx.activity.update({
          where: { id: activityId },
          data: { actualQty: f.qty, actualMandays: f.mandays, actualStart: f.start, actualFinish: f.finish, status: f.status },
        });
      }
      await seedIssues(tx, { projectId: project.id, index: n, engineerId, acts, today });
    }

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
  await seedProcurement(tx, { today, now: new Date(), ownerId, userIds, materialIds: refs.material, projects: procurementProjects });
  await seedQuality(tx, { today, now: new Date(), userIds, projects: procurementProjects });
  await ensureSequenceAtLeast(tx, "CLI", n);
  await ensureSequenceAtLeast(tx, "PRJ", n);
  await tx.appMeta.upsert({ where: { key: META_KEY }, create: { key: META_KEY, value: String(SEED_VERSION) }, update: { value: String(SEED_VERSION) } });
  return { users: DEMO_ACCOUNTS.length, projects: PROJECTS.length };
}

/** Wipe and recreate all demo records atomically. */
export async function resetDemo(client: PrismaClient) {
  // Uploaded demo photos live on disk; remember them so the files can go once the database change has committed.
  const photos = await client.dprPhoto.findMany({ where: { isDemo: true }, select: { projectId: true, fileKey: true } });
  const result = await client.$transaction(
    async (tx) => {
      await wipeDemo(tx);
      return seedAll(tx);
    },
    { timeout: 180_000, maxWait: 20_000 },
  );
  const root = path.resolve(process.env.UPLOAD_DIR ?? "./.uploads");
  await Promise.all(photos.map((p) => rm(path.join(root, "dpr", p.projectId, p.fileKey), { force: true })));
  return result;
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
