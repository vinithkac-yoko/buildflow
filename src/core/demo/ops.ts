/**
 * Demo data for milestone 6: delays with evidence, equipment on sites with hours and one breakdown, documents with versions
 * (files are real, small PDFs written to the upload folder), and subcontractor work orders with measurements, bills and payments.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DelayCategory, DocumentCategory, DocumentStatus, EquipmentLogKind, InvoiceStatus, PaymentMode, Prisma, ResponsibleFunction } from "@prisma/client";
import { addDays } from "../dates";
import { nextCode } from "../common";

type Tx = Prisma.TransactionClient;

export interface OpsSeedInput {
  today: Date;
  now: Date;
  userIds: Map<string, string>;
  projects: { index: number; id: string; pmEmail: string; engineerEmail: string | null }[];
}

const money = (n: number) => Math.round(n * 100) / 100;
const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR ?? "./.uploads");

/** A small but valid one-page PDF carrying the document's title. */
export function makePdf(title: string): Buffer {
  const safe = title.replace(/[()\\]/g, " ").slice(0, 80);
  const stream = `BT /F1 20 Tf 60 740 Td (${safe}) Tj ET\nBT /F1 11 Tf 60 710 Td (BUILDFlow demo document - not a real drawing) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function writePdf(projectId: string, title: string) {
  const key = `${randomUUID()}.pdf`;
  const dir = path.join(uploadRoot(), "documents", projectId);
  await mkdir(dir, { recursive: true });
  const buf = makePdf(title);
  await writeFile(path.join(dir, key), buf);
  return { key, size: buf.length };
}

interface DelayPlan { p: number; category: DelayCategory; factor: string; startAgo: number; endAgo: number | null; critical: boolean; cost: number; evidence: string; impact: string; fn: ResponsibleFunction; action: string; activity?: string }
const DELAYS: DelayPlan[] = [
  { p: 2, category: "MATERIAL_SUPPLY", factor: "Reinforcement steel delivery arrived 10 days after the promised date", startAgo: 24, endAgo: 14, critical: true, cost: 85000, evidence: "Delivery challans, PO expected date vs receipt, WhatsApp thread with supplier", impact: "Footing reinforcement could not start; two gangs idle for part of the period", fn: "PROCUREMENT", action: "Second supplier approved for steel; order placed 10 days ahead of need from now on", activity: "Footing reinforcement" },
  { p: 2, category: "DRAWING_APPROVAL", factor: "Basement shoring drawing still waiting for structural consultant sign-off", startAgo: 6, endAgo: null, critical: true, cost: 0, evidence: "Email to consultant on the 24th; two reminders sent; issue ISS raised", impact: "Basement excavation cannot go deeper than the approved level", fn: "DESIGN", action: "Escalated to the consultant's principal; approval promised by end of week" },
  { p: 3, category: "WEATHER", factor: "Three days of heavy rain stopped external plaster and painting", startAgo: 20, endAgo: 17, critical: false, cost: 0, evidence: "Weather reports, site photos of wet scaffolding", impact: "External work pushed back three days", fn: "SITE_EXECUTION", action: "Tarpaulin cover for fresh plaster added to the site kit" },
  { p: 1, category: "LABOUR_AVAILABILITY", factor: "Mason gang absent for the local festival week", startAgo: 30, endAgo: 28, critical: false, cost: 0, evidence: "Attendance sheets from the DPRs on those days", impact: "Block work paused for two days", fn: "PLANNING", action: "Festival dates added to the labour plan for future stages" },
];

interface EquipPlan { name: string; p: number; sinceAgo: number; hours: number[]; act?: string; breakdown?: { ago: number; note: string }; maintenance?: { ago: number; note: string } }
const EQUIP: EquipPlan[] = [
  { name: "Concrete mixer 10/7", p: 1, sinceAgo: 40, hours: [6, 7, 5, 0, 8, 6], act: "Footing concrete RMC M25" },
  { name: "Needle vibrator", p: 3, sinceAgo: 25, hours: [3, 4, 2, 0, 3], maintenance: { ago: 15, note: "Shaft head replaced and greased" } },
  { name: "Bar bending machine", p: 2, sinceAgo: 30, hours: [5, 6, 0, 4], breakdown: { ago: 2, note: "Motor overheated and tripped; electrician called" } },
  { name: "JCB backhoe loader (rental)", p: 4, sinceAgo: 12, hours: [8, 8, 7, 6, 8] },
  { name: "Scaffolding set (cuplock)", p: 7, sinceAgo: 60, hours: [] },
];

interface DocPlan { p: number; category: DocumentCategory; title: string; versions: number; status: DocumentStatus; reason?: string; ageDays: number; uploader?: "pm" | "engineer" }
const DOCS: DocPlan[] = [
  { p: 1, category: "AGREEMENT", title: "Construction agreement — signed copy", versions: 1, status: "RELEASED", ageDays: 300 },
  { p: 1, category: "DRAWINGS", title: "Structural drawings — ground and first floor", versions: 3, status: "RELEASED", ageDays: 200 },
  { p: 1, category: "DRAWINGS", title: "Electrical layout — first floor", versions: 1, status: "UPLOADED", ageDays: 1 },
  { p: 1, category: "BOQ", title: "Bill of quantities — revision 1", versions: 1, status: "APPROVED", ageDays: 180 },
  { p: 2, category: "DRAWINGS", title: "Basement shoring drawing", versions: 2, status: "REJECTED", reason: "Section at gridline C missing the waler beam detail. Resubmit with the revised section.", ageDays: 8 },
  { p: 3, category: "DRAWINGS", title: "Interior layout — living and dining", versions: 2, status: "UPLOADED", ageDays: 2 },
  { p: 4, category: "QUALITY", title: "Brickwork inspection summary", versions: 1, status: "APPROVED", ageDays: 28 },
  { p: 7, category: "HANDOVER", title: "Pool operation and maintenance guide", versions: 1, status: "RELEASED", ageDays: 5 },
  { p: 7, category: "HANDOVER", title: "As-built drawings — ground floor", versions: 1, status: "APPROVED", ageDays: 4 },
];

interface WoPlan { p: number; sub: string; title: string; measuredPct: number; bills: { no: string; ago: number; due: number; share: number; paidShare: number; mode?: PaymentMode; ref?: string }[] }
const WORK_ORDERS: WoPlan[] = [
  { p: 1, sub: "Kongu Shuttering Works", title: "Shuttering and staging — ground and first floor", measuredPct: 70, bills: [{ no: "KSW/118", ago: 20, due: 30, share: 0.6, paidShare: 1, mode: "BANK_TRANSFER", ref: "UTR 9021 4432 11" }, { no: "KSW/131", ago: 4, due: 30, share: 0.4, paidShare: 0 }] },
  { p: 2, sub: "Balaji Bar Bending Contractors", title: "Bar bending and fixing — footings and plinth", measuredPct: 60, bills: [{ no: "BBC/071", ago: 50, due: 30, share: 1, paidShare: 0 }] },
  { p: 4, sub: "Vel Electricals & Wiring", title: "Concealed conduit and wiring — ground floor", measuredPct: 45, bills: [{ no: "VEW/204", ago: 10, due: 30, share: 1, paidShare: 0.5, mode: "UPI", ref: "UPI 3341 8820" }] },
  { p: 3, sub: "Murugan Plastering & Finishes", title: "Internal plastering — all floors", measuredPct: 35, bills: [] },
];

export async function seedOps(tx: Tx, input: OpsSeedInput) {
  const at = (daysAgo: number, hour = 10) => new Date(addDays(input.today, -daysAgo).getTime() + hour * 3_600_000);
  const proj = (i: number) => input.projects.find((p) => p.index === i);
  const user = (e: string) => input.userIds.get(e)!;
  const accountsId = user("accounts@buildflow.demo");

  // ── delays ──
  for (const d of DELAYS) {
    const p = proj(d.p);
    if (!p) continue;
    const act = d.activity ? await tx.activity.findFirst({ where: { projectId: p.id, name: d.activity }, select: { id: true } }) : null;
    const start = addDays(input.today, -d.startAgo);
    const end = d.endAgo === null ? null : addDays(input.today, -d.endAgo);
    await tx.delay.create({
      data: {
        code: await nextCode(tx, "DLY"), projectId: p.id, activityId: act?.id ?? null, category: d.category, delayFactor: d.factor, startDate: start, endDate: end,
        daysLost: Math.round(((end ?? input.today).getTime() - start.getTime()) / 86_400_000) + 1, criticalPathImpact: d.critical, costImpact: d.cost, evidence: d.evidence, impact: d.impact,
        responsibleFunction: d.fn, correctiveAction: d.action, recordedById: user(p.pmEmail), createdAt: at(d.startAgo - 1), isDemo: true,
      },
    });
  }

  // ── equipment ──
  const equipment = new Map((await tx.equipment.findMany({ where: { isDemo: true }, select: { id: true, name: true } })).map((e) => [e.name, e.id]));
  for (const e of EQUIP) {
    const p = proj(e.p);
    const id = equipment.get(e.name);
    if (!p || !id) continue;
    const act = e.act ? await tx.activity.findFirst({ where: { projectId: p.id, name: e.act }, select: { id: true } }) : null;
    await tx.equipmentAssignment.create({ data: { equipmentId: id, projectId: p.id, activityId: act?.id ?? null, fromDate: addDays(input.today, -e.sinceAgo), assignedById: user(p.pmEmail), isDemo: true, createdAt: at(e.sinceAgo) } });
    for (const [k, h] of e.hours.entries()) {
      if (h <= 0) continue;
      await tx.equipmentLog.create({ data: { equipmentId: id, projectId: p.id, activityId: act?.id ?? null, logDate: addDays(input.today, -(e.hours.length - k + 3)), kind: "USAGE" as EquipmentLogKind, hours: h, loggedById: user(p.pmEmail), isDemo: true } });
    }
    if (e.maintenance) await tx.equipmentLog.create({ data: { equipmentId: id, projectId: p.id, logDate: addDays(input.today, -e.maintenance.ago), kind: "MAINTENANCE", note: e.maintenance.note, loggedById: user(p.pmEmail), isDemo: true } });
    let status: "IN_USE" | "BREAKDOWN" = "IN_USE";
    if (e.breakdown) {
      await tx.equipmentLog.create({ data: { equipmentId: id, projectId: p.id, logDate: addDays(input.today, -e.breakdown.ago), kind: "BREAKDOWN", note: e.breakdown.note, loggedById: user(p.pmEmail), isDemo: true } });
      status = "BREAKDOWN";
    }
    await tx.equipment.update({ where: { id }, data: { status } });
  }

  // ── documents ──
  for (const d of DOCS) {
    const p = proj(d.p);
    if (!p) continue;
    const uploader = user(p.pmEmail);
    const doc = await tx.document.create({
      data: {
        code: await nextCode(tx, "DOC"), projectId: p.id, category: d.category, title: d.title, status: d.status, statusNote: d.reason ?? null, currentVersion: d.versions,
        decidedById: d.status === "UPLOADED" ? null : uploader, decidedAt: d.status === "UPLOADED" ? null : at(Math.max(0, d.ageDays - 1)), releasedAt: d.status === "RELEASED" ? at(Math.max(0, d.ageDays - 1)) : null,
        uploadedById: uploader, createdAt: at(d.ageDays), isDemo: true,
      },
    });
    for (let v = 1; v <= d.versions; v++) {
      const f = await writePdf(p.id, `${d.title} - version ${v}`);
      await tx.documentVersion.create({
        data: {
          documentId: doc.id, version: v, fileKey: f.key, fileName: `${d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-v${v}.pdf`, mimeType: "application/pdf", sizeBytes: f.size,
          isCurrent: v === d.versions, note: v > 1 ? "Revised after review comments" : null, uploadedById: uploader, createdAt: at(Math.max(0, d.ageDays - (v - 1) * 3)), isDemo: true,
        },
      });
    }
  }

  // ── subcontractor work orders → measurement → bill → payment ──
  const subs = new Map((await tx.subcontractor.findMany({ where: { isDemo: true }, select: { id: true, name: true, tradeId: true } })).map((s) => [s.name, s]));
  for (const w of WORK_ORDERS) {
    const p = proj(w.p);
    const sub = subs.get(w.sub);
    if (!p || !sub) continue;
    const acts = await tx.activity.findMany({ where: { projectId: p.id, tradeId: sub.tradeId, status: { in: ["IN_PROGRESS", "COMPLETED"] } }, orderBy: { code: "asc" }, take: 2 });
    if (acts.length === 0) continue;
    const lines = acts.map((a) => {
      const qty = Math.max(1, Math.round(Number(a.plannedQty) * 0.6));
      const rate = Math.max(1, Math.round((Number(a.plannedCost) / Number(a.plannedQty)) * 0.4));
      return { a, qty, rate };
    });
    const wo = await tx.workOrder.create({
      data: {
        code: await nextCode(tx, "WO"), projectId: p.id, subcontractorId: sub.id, title: w.title, scope: "Labour and supervision only; material by the company.", issuedOn: at(60, 0), issuedById: user(p.pmEmail), createdAt: at(60), isDemo: true,
        items: { create: lines.map((l) => ({ activityId: l.a.id, description: l.a.name, uomId: l.a.uomId, quantity: l.qty, workRate: l.rate })) },
      },
      include: { items: true },
    });
    // Two measurement rounds per line (the second a smaller top-up), together the planned share of the ordered quantity.
    const measuredIds: { id: string; value: number }[][] = [[], []];
    for (const it of wo.items) {
      const total = money(Number(it.quantity) * (w.measuredPct / 100));
      const first = money(total * 0.65);
      const rounds: [number, number][] = [[first, 25], [money(total - first), 6]];
      let sum = 0;
      for (const [r, [q, ago]] of rounds.entries()) {
        if (q <= 0) continue;
        const m = await tx.workOrderMeasurement.create({ data: { itemId: it.id, measuredOn: addDays(input.today, -ago), quantity: q, measuredById: user(p.pmEmail), createdAt: at(ago), isDemo: true } });
        measuredIds[r].push({ id: m.id, value: q * Number(it.workRate) });
        sum += q;
      }
      await tx.workOrderItem.update({ where: { id: it.id }, data: { measuredQty: sum } });
    }
    // Bills: the first covers the first round (or all of it when there is one bill), the second the rest.
    for (const [bi, b] of w.bills.entries()) {
      const mine = w.bills.length === 1 ? measuredIds.flat() : measuredIds[bi] ?? [];
      if (mine.length === 0) continue;
      const gross = money(mine.reduce((s, m) => s + m.value, 0));
      const retention = money(gross * 0.05);
      const net = money(gross - retention);
      const paid = money(net * b.paidShare);
      const status: InvoiceStatus = paid <= 0 ? "UNPAID" : paid >= net - 0.001 ? "PAID" : "PARTIALLY_PAID";
      const bill = await tx.subcontractorBill.create({
        data: {
          code: await nextCode(tx, "SB"), workOrderId: wo.id, projectId: p.id, subcontractorId: sub.id, billNo: b.no, billDate: addDays(input.today, -b.ago), dueDate: addDays(input.today, -b.ago + b.due),
          billGross: gross, retentionPct: 5, billRetention: retention, billNet: net, billPaid: paid, status, enteredById: accountsId, createdAt: at(b.ago), isDemo: true,
        },
      });
      await tx.workOrderMeasurement.updateMany({ where: { id: { in: mine.map((m) => m.id) } }, data: { billId: bill.id } });
      if (paid > 0) {
        await tx.subcontractorPayment.create({
          data: { code: await nextCode(tx, "SP"), billId: bill.id, projectId: p.id, paidOn: addDays(input.today, -Math.max(1, b.ago - 8)), subPaymentAmount: paid, mode: b.mode ?? "BANK_TRANSFER", reference: b.ref ?? null, paidById: accountsId, createdAt: at(Math.max(1, b.ago - 8)), isDemo: true },
        });
      }
    }
    if (wo.items.every((it) => w.measuredPct >= 100 && Number(it.quantity) > 0)) await tx.workOrder.update({ where: { id: wo.id }, data: { status: "COMPLETED" } });
  }
}
