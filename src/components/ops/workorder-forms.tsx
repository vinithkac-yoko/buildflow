"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cancelWorkOrderAction, createSubBillAction, createWorkOrderAction, recordMeasurementAction, recordSubPaymentAction } from "@/actions/ops";
import { FormModal, areaCls, numOrUndef, selectCls, today } from "@/components/forms/form-modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PAYMENT_MODES, PAYMENT_MODE_LABEL } from "@/core/procurement/schemas";
import type { ProjectActs } from "./issue-delay-forms";

interface Line { activityId: string; description: string; quantity: string; workRate: string }
const blank = (): Line => ({ activityId: "", description: "", quantity: "", workRate: "" });

/** Issue a work order: pick the subcontractor, then the activities, quantities and rates. */
export function WorkOrderCreateButton({ projects, subcontractors, units }: { projects: ProjectActs[]; subcontractors: { value: string; label: string }[]; units: Record<string, string> }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [subId, setSubId] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const project = projects.find((p) => p.id === projectId);
  const setLine = (i: number, k: keyof Line, v: string) => setLines((cur) => cur.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <FormModal title="Issue a work order" label="Issue a work order" wide submitLabel="Issue work order" successMessage="Work order issued."
      onSubmit={() => createWorkOrderAction(projectId, {
        subcontractorId: subId, title, scope: scope || null,
        items: lines.map((l) => ({ activityId: l.activityId, description: l.description || null, quantity: numOrUndef(l.quantity), workRate: numOrUndef(l.workRate) })),
      })}>
      {({ err }) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.length > 1 && (
              <div><Label htmlFor="wo-project">Project</Label>
                <select id="wo-project" className={selectCls} value={projectId} onChange={(e) => { setProjectId(e.target.value); setLines([blank()]); }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></div>
            )}
            <div><Label htmlFor="wo-sub">Subcontractor <span className="text-danger">*</span></Label>
              <select id="wo-sub" className={selectCls} value={subId} onChange={(e) => setSubId(e.target.value)}><option value="">Select…</option>{subcontractors.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>{err("subcontractorId")}</div>
          </div>
          <div><Label htmlFor="wo-title">Title <span className="text-danger">*</span></Label><Input id="wo-title" value={title} onChange={(e) => setTitle(e.target.value)} />{err("title")}</div>
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="panel space-y-2 p-3">
                <div><Label htmlFor={`wo-act-${i}`}>Activity</Label>
                  <select id={`wo-act-${i}`} className={selectCls} value={l.activityId} onChange={(e) => setLine(i, "activityId", e.target.value)}><option value="">Select…</option>{project?.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{err(`items.${i}.activityId`)}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor={`wo-qty-${i}`}>Quantity{l.activityId && units[l.activityId] ? ` (${units[l.activityId]})` : ""}</Label><Input id={`wo-qty-${i}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />{err(`items.${i}.quantity`)}</div>
                  <div><Label htmlFor={`wo-rate-${i}`}>Rate (₹){l.activityId && units[l.activityId] ? ` per ${units[l.activityId]}` : ""}</Label><Input id={`wo-rate-${i}`} inputMode="decimal" value={l.workRate} onChange={(e) => setLine(i, "workRate", e.target.value)} />{err(`items.${i}.workRate`)}</div>
                </div>
                {lines.length > 1 && <Button type="button" variant="ghost" onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" aria-hidden />Remove line</Button>}
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => setLines((cur) => [...cur, blank()])}><Plus className="h-4 w-4" aria-hidden />Add another activity</Button>
          </div>
          <div><Label htmlFor="wo-scope">Scope (optional)</Label><textarea id="wo-scope" rows={2} className={areaCls} value={scope} onChange={(e) => setScope(e.target.value)} /></div>
        </>
      )}
    </FormModal>
  );
}

export function MeasureButton({ workOrderId, items }: { workOrderId: string; items: { id: string; description: string; unit: string; remaining: number }[] }) {
  const open = items.filter((i) => i.remaining > 0);
  const [itemId, setItemId] = useState(open[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const item = open.find((i) => i.id === itemId);
  return (
    <FormModal title="Record measured work" label="Record measurement" submitLabel="Save measurement" successMessage="Measurement recorded."
      onSubmit={() => recordMeasurementAction(workOrderId, { itemId, quantity: numOrUndef(qty), measuredOn: date, note: note || null })}>
      {({ err }) => (
        <>
          <div><Label htmlFor="ms-item">Work item</Label>
            <select id="ms-item" className={selectCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>{open.map((i) => <option key={i.id} value={i.id}>{i.description} — {i.remaining} {i.unit} left</option>)}</select>{err("itemId")}</div>
          <div><Label htmlFor="ms-qty">Quantity measured{item ? ` (${item.unit})` : ""}</Label><Input id="ms-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />{err("quantity")}</div>
          <div><Label htmlFor="ms-date">Measured on</Label><Input id="ms-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />{err("measuredOn")}</div>
          <div><Label htmlFor="ms-note">Note</Label><Input id="ms-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </>
      )}
    </FormModal>
  );
}

export function BillButton({ workOrderId, unbilledValue }: { workOrderId: string; unbilledValue?: number }) {
  const [no, setNo] = useState("");
  const [date, setDate] = useState(today());
  const [due, setDue] = useState("");
  const [ret, setRet] = useState("5");
  return (
    <FormModal title="Raise a subcontractor bill" label="Raise bill" submitLabel="Save bill" successMessage="Bill raised."
      onSubmit={() => createSubBillAction(workOrderId, { billNo: no, billDate: date, dueDate: due || null, retentionPct: numOrUndef(ret) })}>
      {({ err }) => (
        <>
          <p className="text-[15px] text-muted">The bill covers all measured work not yet billed{unbilledValue !== undefined ? ` (₹${Math.round(unbilledValue).toLocaleString("en-IN")} before retention)` : ""}.</p>
          <div><Label htmlFor="sb-no">Bill number <span className="text-danger">*</span></Label><Input id="sb-no" value={no} onChange={(e) => setNo(e.target.value)} />{err("billNo")}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="sb-date">Bill date</Label><Input id="sb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />{err("billDate")}</div>
            <div><Label htmlFor="sb-due">Due date</Label><Input id="sb-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />{err("dueDate")}</div>
          </div>
          <div><Label htmlFor="sb-ret">Retention held back (%)</Label><Input id="sb-ret" inputMode="decimal" value={ret} onChange={(e) => setRet(e.target.value)} />{err("retentionPct")}</div>
        </>
      )}
    </FormModal>
  );
}

export function SubPaymentButton({ billId, outstanding }: { billId: string; outstanding?: number }) {
  const [amount, setAmount] = useState(outstanding ? String(outstanding) : "");
  const [paidOn, setPaidOn] = useState(today());
  const [mode, setMode] = useState("BANK_TRANSFER");
  const [ref, setRef] = useState("");
  return (
    <FormModal title="Pay the bill" label="Record payment" icon="none" submitLabel="Save payment" successMessage="Payment recorded."
      onSubmit={() => recordSubPaymentAction(billId, { amount: numOrUndef(amount), paidOn, mode, reference: ref || null })}>
      {({ err }) => (
        <>
          <div><Label htmlFor="sp-amt">Amount paid (₹)</Label><Input id="sp-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {outstanding !== undefined && <p className="mt-1 text-sm text-muted">Still payable: ₹{outstanding.toLocaleString("en-IN")}</p>}{err("amount")}</div>
          <div><Label htmlFor="sp-on">Paid on</Label><Input id="sp-on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />{err("paidOn")}</div>
          <div><Label htmlFor="sp-mode">How was it paid?</Label><select id="sp-mode" className={selectCls} value={mode} onChange={(e) => setMode(e.target.value)}>{PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABEL[m]}</option>)}</select>{err("mode")}</div>
          <div><Label htmlFor="sp-ref">Reference (UTR / cheque no.)</Label><Input id="sp-ref" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        </>
      )}
    </FormModal>
  );
}

export function CancelWorkOrderButton({ workOrderId }: { workOrderId: string }) {
  const [reason, setReason] = useState("");
  return (
    <FormModal title="Cancel this work order" label="Cancel work order" icon="none" variant="ghost" submitLabel="Cancel work order" successMessage="Work order cancelled."
      onSubmit={() => cancelWorkOrderAction(workOrderId, reason)}>
      {({ err }) => <div><Label htmlFor="cw-reason">Why?</Label><textarea id="cw-reason" rows={3} className={areaCls} value={reason} onChange={(e) => setReason(e.target.value)} />{err("reason")}</div>}
    </FormModal>
  );
}
