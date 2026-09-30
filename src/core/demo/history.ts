/**
 * Demo history: a daily approved DPR for every day a project has been running, with labour, material issues and a
 * consistent stock ledger. Quantities follow the same phase model the plan uses, so actual % lands where the demo
 * needs it (see solver.ts). Rows are created with createMany for speed; the running balances are written at the end.
 */
import { randomUUID } from "node:crypto";
import type { Prisma, Weather, LabourSource, ActivityStatus } from "@prisma/client";
import { DAY_MS, addDays, dayDiff } from "../dates";
import type { TemplateRow } from "./data";
import { completion, rng } from "./solver";

type Tx = Prisma.TransactionClient;

export interface HistoryAct {
  id: string;
  row: TemplateRow;
  plannedQty: number;
  prod: number;
}

export interface HistoryInput {
  projectId: string;
  projectIndex: number;
  start: Date;
  today: Date;
  now: Date;
  /** Work front reached at the last approved report (0..1). */
  frontNow: number;
  /** 0 = approved reports run through today, 1 = through yesterday, 2 = through the day before. */
  lastApprovedOffset: 0 | 1 | 2;
  /** A report filed today that is still waiting for the PM. */
  pendingToday: boolean;
  engineerId: string;
  pmId: string;
  acts: HistoryAct[];
  bom: { activityId: string; materialId: string; coefficient: number; wastagePct: number }[];
  materials: Map<string, { id: string; name: string; threshold: number; unitCost: number }>;
  mainStoreId: string;
  yardId: string;
  tradeIds: Map<string, string>;
  subByTrade: Map<string, string>;
  wageByTradeId: Map<string, number>;
  /** Leave this material below its reorder threshold at the end (demo: one low-stock item). */
  lowStockMaterial?: string;
  halted?: boolean;
}

export interface HistoryResult {
  reports: number;
  activityFinal: Map<string, { qty: number; mandays: number; start: Date | null; finish: Date | null; status: ActivityStatus }>;
}

const REMARKS = [
  "Concrete curing in progress", "Material delivery on time", "Labour attendance good", "Minor delay in shuttering",
  "PM site visit today", "Bar bending completed for next pour", "Plumbing sleeves checked before pour", "Water supply interrupted for two hours",
];
const BULK = new Set(["M-sand", "P-sand (plastering)", "20mm aggregate", "40mm aggregate", "Red brick", "AAC block 200mm", "AAC block 100mm"]);
const round2 = (n: number) => Math.round(n * 100) / 100;
const at = (d: Date, hoursUtc: number) => new Date(d.getTime() + hoursUtc * 3_600_000);

export async function seedHistory(tx: Tx, h: HistoryInput): Promise<HistoryResult> {
  const rand = rng(1000 + h.projectIndex * 97);
  const lastDate = addDays(h.today, -h.lastApprovedOffset);
  const n = dayDiff(lastDate, h.start) + 1;
  const days = Array.from({ length: Math.max(0, n) }, (_, i) => addDays(h.start, i));
  const activityFinal: HistoryResult["activityFinal"] = new Map();
  if (days.length === 0 && !h.pendingToday) {
    for (const a of h.acts) activityFinal.set(a.id, { qty: 0, mandays: 0, start: null, finish: null, status: "NOT_STARTED" });
    return { reports: 0, activityFinal };
  }

  // ── weather, working weight and the work front for each day ──
  const weather: Weather[] = [];
  const weight: number[] = [];
  for (let i = 0; i < days.length; i++) {
    const r = rand();
    const w: Weather = r < 0.03 ? "HEAVY_RAIN" : r < 0.15 ? "RAIN" : r < 0.45 ? "CLOUDY" : "SUNNY";
    weather.push(w);
    weight.push(w === "HEAVY_RAIN" ? 0 : w === "RAIN" ? 0.4 + rand() * 0.3 : 0.7 + rand() * 0.6);
  }
  if (days.length > 0 && !weight.some((x) => x > 0)) weight[0] = 1;
  const totalW = weight.reduce((s, x) => s + x, 0) || 1;
  const front: number[] = [];
  let run = 0;
  for (const w of weight) {
    run += w;
    front.push((h.frontNow * run) / totalW);
  }
  const avgW = totalW / Math.max(1, days.length);
  const pendingFront = Math.min(1, h.frontNow + (h.frontNow * avgW) / totalW);

  interface Line { actId: string; qty: number }
  interface DayRec {
    id: string; date: Date; status: "APPROVED" | "SUBMITTED"; weather: Weather; noWork: boolean; remarks: string | null; lines: Line[];
    labour: { actId: string; tradeId: string; source: LabourSource; subId: string | null; headcount: number; hours: number; mandays: number; cost: number }[];
    mats: { actId: string; materialId: string; qty: number }[];
  }
  const recs: DayRec[] = [];
  const prevCum = new Map<string, number>(h.acts.map((a) => [a.id, 0]));

  const build = (date: Date, f: number, wx: Weather, status: DayRec["status"]): DayRec => {
    const lines: Line[] = [];
    for (const a of h.acts) {
      const cum = round2(a.plannedQty * completion(a.row, f));
      const before = prevCum.get(a.id) ?? 0;
      const q = round2(cum - before);
      if (q > 0) lines.push({ actId: a.id, qty: q });
      if (status === "APPROVED") prevCum.set(a.id, cum);
    }
    const rec: DayRec = {
      id: randomUUID(), date, status, weather: wx, noWork: false, remarks: null, lines, labour: [], mats: [],
    };
    if (lines.length === 0) {
      rec.noWork = true;
      rec.remarks = wx === "HEAVY_RAIN" ? "Heavy rain — no work today" : "Waiting for material; no work today";
      return rec;
    }
    if (rand() < 0.3) rec.remarks = REMARKS[Math.floor(rand() * REMARKS.length)];
    for (const l of rec.lines) {
      const a = h.acts.find((x) => x.id === l.actId)!;
      const tradeId = h.tradeIds.get(a.row.trade)!;
      const hours = rand() < 0.15 ? 10 : 8;
      const mandaysNeeded = l.qty / a.prod;
      const headcount = Math.max(1, Math.round((mandaysNeeded * 8) / hours));
      const sub = h.subByTrade.get(a.row.trade) ?? null;
      const source: LabourSource = sub && a.row.trade !== "Mason" && a.row.trade !== "Helper" ? "SUBCONTRACTOR" : a.row.trade === "Painter" ? "PIECE_RATE" : "CONTRACT_LABOUR";
      const mandays = (headcount * hours) / 8;
      rec.labour.push({
        actId: l.actId, tradeId, source, subId: source === "SUBCONTRACTOR" ? sub : null, headcount, hours,
        mandays: Number(mandays.toFixed(3)), cost: Number((mandays * (h.wageByTradeId.get(tradeId) ?? 800)).toFixed(2)),
      });
    }
    for (const b of h.bom) {
      const l = rec.lines.find((x) => x.actId === b.activityId);
      if (!l) continue;
      const used = l.qty * b.coefficient * (1 + (b.wastagePct / 100) * (0.4 + rand() * 0.9));
      const q = used >= 10 ? Math.round(used) : Math.round(used * 10) / 10;
      if (q > 0) rec.mats.push({ actId: b.activityId, materialId: b.materialId, qty: q });
    }
    return rec;
  };

  days.forEach((d, i) => recs.push(build(d, front[i], weather[i], "APPROVED")));
  if (h.pendingToday) recs.push(build(h.today, pendingFront, "SUNNY", "SUBMITTED"));

  // ── activity results from approved reports ──
  const approved = recs.filter((r) => r.status === "APPROVED");
  const cum = new Map<string, number>();
  const mandays = new Map<string, number>();
  const firstDate = new Map<string, Date>();
  const finishDate = new Map<string, Date>();
  const plannedById = new Map(h.acts.map((a) => [a.id, a.plannedQty]));
  for (const r of approved) {
    for (const l of r.lines) {
      const c = round2((cum.get(l.actId) ?? 0) + l.qty);
      cum.set(l.actId, c);
      if (!firstDate.has(l.actId)) firstDate.set(l.actId, r.date);
      if (c >= (plannedById.get(l.actId) ?? Infinity) - 0.005 && !finishDate.has(l.actId)) finishDate.set(l.actId, r.date);
    }
    for (const lb of r.labour) mandays.set(lb.actId, (mandays.get(lb.actId) ?? 0) + lb.mandays);
  }
  for (const a of h.acts) {
    const q = cum.get(a.id) ?? 0;
    let status: ActivityStatus = q <= 0 ? "NOT_STARTED" : finishDate.has(a.id) ? "COMPLETED" : "IN_PROGRESS";
    if (h.halted && status === "IN_PROGRESS") status = "HALTED";
    activityFinal.set(a.id, {
      qty: q, mandays: Number((mandays.get(a.id) ?? 0).toFixed(2)), start: firstDate.get(a.id) ?? null,
      finish: status === "COMPLETED" ? (finishDate.get(a.id) ?? null) : null, status,
    });
  }

  // ── stock: opening quantities cover everything issued so far plus a buffer ──
  const usedByMat = new Map<string, number>();
  for (const r of approved) for (const m of r.mats) usedByMat.set(m.materialId, (usedByMat.get(m.materialId) ?? 0) + m.qty);
  const pendingUse = new Map<string, number>();
  for (const r of recs.filter((x) => x.status === "SUBMITTED")) for (const m of r.mats) pendingUse.set(m.materialId, (pendingUse.get(m.materialId) ?? 0) + m.qty);

  const soon = new Set(
    h.bom.filter((b) => {
      const a = h.acts.find((x) => x.id === b.activityId)!;
      return a.row.ph[0] <= h.frontNow + 0.12 && completion(a.row, h.frontNow) < 1;
    }).map((b) => b.materialId),
  );
  const openingMain = new Map<string, number>();
  const openingYard = new Map<string, number>();
  const wanted = new Set([...usedByMat.keys(), ...soon]);
  for (const id of wanted) {
    const m = h.materials.get(id)!;
    const used = usedByMat.get(id) ?? 0;
    const avgDaily = used / Math.max(1, days.length);
    const isLow = h.lowStockMaterial && m.name === h.lowStockMaterial;
    const buffer = isLow
      ? Math.max(1, Math.floor(m.threshold * 0.55)) + (pendingUse.get(id) ?? 0)
      : Math.max(m.threshold * 1.6, avgDaily * 4, 12) + (pendingUse.get(id) ?? 0);
    const bulk = BULK.has(m.name) && !isLow;
    const yard = bulk ? Math.round(buffer * 0.3) : 0;
    openingMain.set(id, Math.round((used + buffer - yard) * 100) / 100);
    if (yard > 0) openingYard.set(id, yard);
  }

  const ledger: Prisma.InventoryLedgerCreateManyInput[] = [];
  const startAt = at(h.start, 3);
  for (const [id, q] of openingMain) {
    ledger.push({ id: randomUUID(), projectId: h.projectId, storageLocationId: h.mainStoreId, materialId: id, type: "OPENING_STOCK", quantity: q, unitCost: h.materials.get(id)!.unitCost, note: "Opening stock", createdById: h.pmId, isDemo: true, createdAt: startAt });
  }
  for (const [id, q] of openingYard) {
    ledger.push({ id: randomUUID(), projectId: h.projectId, storageLocationId: h.yardId, materialId: id, type: "OPENING_STOCK", quantity: q, unitCost: h.materials.get(id)!.unitCost, note: "Opening stock", createdById: h.pmId, isDemo: true, createdAt: startAt });
  }
  const balance = new Map<string, number>(); // key: material|location
  for (const [id, q] of openingMain) balance.set(`${id}|${h.mainStoreId}`, q);
  for (const [id, q] of openingYard) balance.set(`${id}|${h.yardId}`, q);
  for (const r of approved) {
    for (const m of r.mats) {
      let remaining = m.qty;
      for (const loc of [h.mainStoreId, h.yardId]) {
        const key = `${m.materialId}|${loc}`;
        const have = balance.get(key) ?? 0;
        const take = Math.min(remaining, have);
        if (take <= 0) continue;
        balance.set(key, Math.round((have - take) * 1000) / 1000);
        remaining = Math.round((remaining - take) * 1000) / 1000;
        ledger.push({
          id: randomUUID(), projectId: h.projectId, storageLocationId: loc, materialId: m.materialId, type: "ACTIVITY_ISSUE",
          quantity: take, unitCost: h.materials.get(m.materialId)!.unitCost, activityId: m.actId, dprId: r.id,
          createdById: h.pmId, isDemo: true, createdAt: at(r.date, 12),
        });
        if (remaining <= 1e-9) break;
      }
      if (remaining > 1e-9) throw new Error(`demo seed: stock ran short for ${m.materialId} on ${r.date.toISOString().slice(0, 10)}`);
    }
  }

  // ── write everything ──
  const engineerName = h.engineerId;
  void engineerName;
  const dprRows: Prisma.DprCreateManyInput[] = recs.map((r) => {
    const submittedAt = new Date(Math.min(at(r.date, 12).getTime(), h.now.getTime() - 40 * 60_000));
    const approvedAt = new Date(Math.min(at(addDays(r.date, 1), 4.5 + rand() * 1.5).getTime(), h.now.getTime() - 10 * 60_000));
    return {
      id: r.id, projectId: h.projectId, reportDate: r.date, status: r.status, weather: r.weather, remarks: r.remarks, noWork: r.noWork,
      createdById: h.engineerId, submittedById: h.engineerId, submittedAt,
      ...(r.status === "APPROVED" ? { approvedById: h.pmId, approvedAt } : {}),
      isDemo: true, createdAt: submittedAt,
    };
  });
  await tx.dpr.createMany({ data: dprRows });
  await tx.dprActivityProgress.createMany({
    data: recs.flatMap((r) => r.lines.map((l) => ({ dprId: r.id, projectId: h.projectId, activityId: l.actId, quantity: l.qty, enteredById: h.engineerId, createdAt: at(r.date, 12) }))),
  });
  await tx.labourLog.createMany({
    data: recs.flatMap((r) => r.labour.map((l) => ({
      dprId: r.id, projectId: h.projectId, activityId: l.actId, source: l.source, tradeId: l.tradeId, subcontractorId: l.subId,
      headcount: l.headcount, hours: l.hours, mandays: l.mandays, dailyLabourCost: l.cost, enteredById: h.engineerId, createdAt: at(r.date, 12),
    }))),
  });
  await tx.dprMaterialUse.createMany({
    data: recs.flatMap((r) => r.mats.map((m) => ({ dprId: r.id, projectId: h.projectId, activityId: m.actId, materialId: m.materialId, quantity: m.qty, enteredById: h.engineerId, createdAt: at(r.date, 12) }))),
  });
  for (let i = 0; i < ledger.length; i += 2000) await tx.inventoryLedger.createMany({ data: ledger.slice(i, i + 2000) });
  await tx.stockBalance.createMany({
    data: [...balance].map(([key, q]) => {
      const [materialId, storageLocationId] = key.split("|");
      return { projectId: h.projectId, storageLocationId, materialId, quantity: Math.max(0, q), avgCost: h.materials.get(materialId)!.unitCost };
    }),
  });
  void DAY_MS;
  return { reports: recs.length, activityFinal };
}
