"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  addQuotationAction, adjustStockAction, cancelPurchaseOrderAction, createInvoiceAction, issueStockAction, recordPaymentAction,
  recordReceiptAction, rejectRequestAction, returnStockAction, transferStockAction,
} from "@/actions/procurement";
import { ModalForm } from "@/components/forms/modal-form";
import { SearchSelect } from "@/components/forms/search-select";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toaster";
import type { ActionResult } from "@/core/errors";
import { PAYMENT_MODES, PAYMENT_MODE_LABEL } from "@/core/procurement/schemas";
import type { FieldDef, Option, Values } from "@/lib/forms";

/** Empty text becomes undefined so the server says "Enter …" instead of reading it as zero. */
const n = (s: string | undefined) => (s === undefined || s.trim() === "" ? undefined : Number(s.replace(/,/g, "")));
const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const selectCls = "min-h-12 w-full rounded-xl border bg-bg px-3 text-[17px] border-border";

/** Modal with our own body so multi-line forms (quotation rates, receipt quantities) can show per-line errors. */
function useSubmit(run: () => Promise<ActionResult<unknown>>, ok: string, after: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    start(async () => {
      const res = await run();
      if (res.ok) { toast("success", ok); after(); router.refresh(); }
      else { setError(res.error); setFieldErrors(res.fieldErrors ?? {}); }
    });
  };
  return { pending, error, fieldErrors, submit, reset: () => { setError(null); setFieldErrors({}); } };
}

function Footer({ pending, label, onCancel, error }: { pending: boolean; label: string; onCancel: () => void; error: string | null }) {
  return (
    <>
      {error && <p role="alert" className="mt-4 rounded-xl border border-danger/50 px-3 py-2 text-[15px] text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{pending ? "Saving…" : label}</Button>
      </div>
    </>
  );
}

// ── Quotation ──

export function QuotationButton({ prId, vendors, items }: { prId: string; vendors: Option[]; items: { id: string; material: string; unit: string; quantity: number }[] }) {
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [quoteRef, setQuoteRef] = useState("");
  const [delivery, setDelivery] = useState("");
  const [terms, setTerms] = useState("");
  const [rates, setRates] = useState<Record<string, { rate: string; tax: string }>>(() => Object.fromEntries(items.map((i) => [i.id, { rate: "", tax: "18" }])));
  const f = useSubmit(
    () => addQuotationAction(prId, {
      vendorId, quoteRef: quoteRef || null, deliveryDays: n(delivery) ?? null, paymentTerms: terms || null,
      items: items.map((i) => ({ prItemId: i.id, unitRate: n(rates[i.id].rate), taxPct: n(rates[i.id].tax) })),
    }),
    "Quotation added.",
    () => { setOpen(false); setVendorId(""); setQuoteRef(""); setDelivery(""); setTerms(""); setRates(Object.fromEntries(items.map((i) => [i.id, { rate: "", tax: "18" }]))); },
  );
  const close = () => { setOpen(false); f.reset(); };
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />Add quotation</Button>
      <Modal open={open} onClose={close} title="Add vendor quotation" wide>
        <form onSubmit={f.submit} noValidate className="space-y-4">
          <div>
            <Label>Vendor <span className="text-danger">*</span></Label>
            <SearchSelect label="Vendor" name="vendorId" options={vendors} value={vendorId} onChange={setVendorId} invalid={!!f.fieldErrors.vendorId} placeholder="Select vendor…" />
            {f.fieldErrors.vendorId && <p role="alert" className="mt-1 text-sm text-danger">{f.fieldErrors.vendorId}</p>}
          </div>
          <div className="space-y-3">
            {items.map((i, idx) => (
              <div key={i.id} className="panel p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[16px] font-semibold">{i.material}</span>
                  <span className="num text-sm text-muted">{i.quantity} {i.unit}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`rate-${idx}`}>Rate per {i.unit} (₹)</Label>
                    <Input id={`rate-${idx}`} inputMode="decimal" value={rates[i.id].rate} onChange={(e) => setRates((r) => ({ ...r, [i.id]: { ...r[i.id], rate: e.target.value } }))} />
                  </div>
                  <div>
                    <Label htmlFor={`tax-${idx}`}>GST %</Label>
                    <Input id={`tax-${idx}`} inputMode="decimal" value={rates[i.id].tax} onChange={(e) => setRates((r) => ({ ...r, [i.id]: { ...r[i.id], tax: e.target.value } }))} />
                  </div>
                </div>
                {f.fieldErrors[`items.${idx}.unitRate`] && <p role="alert" className="mt-1 text-sm text-danger">{f.fieldErrors[`items.${idx}.unitRate`]}</p>}
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label htmlFor="q-ref">Vendor&apos;s quote number</Label><Input id="q-ref" value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} /></div>
            <div><Label htmlFor="q-del">Delivery in (days)</Label><Input id="q-del" inputMode="numeric" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
              {f.fieldErrors.deliveryDays && <p role="alert" className="mt-1 text-sm text-danger">{f.fieldErrors.deliveryDays}</p>}</div>
          </div>
          <div><Label htmlFor="q-terms">Payment terms</Label><Input id="q-terms" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. 30 days from delivery" /></div>
          <Footer pending={f.pending} label="Save quotation" onCancel={close} error={f.error} />
        </form>
      </Modal>
    </>
  );
}

// ── Goods receipt ──

export function ReceiptButton({
  orderId, orderCode, locations, lines, label = "Record receipt", variant = "primary", size = "md",
}: {
  orderId: string; orderCode: string; locations: Option[]; label?: string; variant?: "primary" | "secondary"; size?: "md" | "lg";
  lines: { id: string; material: string; unit: string; quantity: number; receivedQty: number; remaining: number }[];
}) {
  const open0 = lines.filter((l) => l.remaining > 0);
  const [open, setOpen] = useState(false);
  const [loc, setLoc] = useState(locations[0]?.value ?? "");
  const [challan, setChallan] = useState("");
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(open0.map((l) => [l.id, String(l.remaining)])));
  const f = useSubmit(
    () => recordReceiptAction(orderId, {
      storageLocationId: loc, challanNo: challan || null, clientTxnId: undefined,
      items: open0.filter((l) => (qty[l.id] ?? "").trim() !== "" && Number(qty[l.id]) !== 0).map((l) => ({ poItemId: l.id, quantity: n(qty[l.id]) })),
    }),
    "Receipt recorded. Stock updated.",
    () => setOpen(false),
  );
  const close = () => { setOpen(false); f.reset(); };
  const itemErr = (id: string) => { const idx = open0.filter((l) => (qty[l.id] ?? "").trim() !== "" && Number(qty[l.id]) !== 0).findIndex((l) => l.id === id); return idx >= 0 ? f.fieldErrors[`items.${idx}.quantity`] : undefined; };
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={close} title={`Receive material — ${orderCode}`} wide>
        <form onSubmit={f.submit} noValidate className="space-y-4">
          <div>
            <Label>Store it in <span className="text-danger">*</span></Label>
            <SearchSelect label="Storage location" name="storageLocationId" options={locations} value={loc} onChange={setLoc} invalid={!!f.fieldErrors.storageLocationId} />
            {f.fieldErrors.storageLocationId && <p role="alert" className="mt-1 text-sm text-danger">{f.fieldErrors.storageLocationId}</p>}
          </div>
          <p className="text-sm text-muted">Enter what actually arrived. Leave a line at 0 if it did not come; a partial delivery is fine.</p>
          <div className="space-y-3">
            {open0.map((l, idx) => (
              <div key={l.id} className="panel p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[16px] font-semibold">{l.material}</span>
                  <span className="num text-sm text-muted">Ordered {l.quantity} · received {l.receivedQty} · due {l.remaining} {l.unit}</span>
                </div>
                <Label htmlFor={`rq-${idx}`}>Received now ({l.unit})</Label>
                <Input id={`rq-${idx}`} inputMode="decimal" value={qty[l.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value.replace(/[^0-9.]/g, "") }))} aria-invalid={itemErr(l.id) ? true : undefined} />
                {itemErr(l.id) && <p role="alert" className="mt-1 text-sm text-danger">{itemErr(l.id)}</p>}
              </div>
            ))}
          </div>
          <div><Label htmlFor="r-ch">Delivery challan number</Label><Input id="r-ch" value={challan} onChange={(e) => setChallan(e.target.value)} /></div>
          <Footer pending={f.pending} label="Record receipt" onCancel={close} error={f.error} />
        </form>
      </Modal>
    </>
  );
}

// ── Invoice, payment, cancel, reject (generic modal forms) ──

export function InvoiceButton({ orderId, yetToInvoice }: { orderId: string; yetToInvoice?: number }) {
  const fields: FieldDef[] = [
    { name: "invoiceNo", label: "Vendor's invoice number", type: "text", required: true },
    { name: "invoiceDate", label: "Invoice date", type: "date", required: true, default: today() },
    { name: "dueDate", label: "Due date", type: "date" },
    { name: "subtotal", label: "Amount before tax", type: "number", required: true, unit: "₹", hint: yetToInvoice !== undefined ? `Up to ₹${Math.round(yetToInvoice).toLocaleString("en-IN")} of the order is still to be invoiced (incl. tax).` : undefined },
    { name: "tax", label: "Tax (GST) amount", type: "number", required: true, unit: "₹", default: "0" },
  ];
  return (
    <ModalForm
      title="Enter vendor invoice" label="Enter invoice" icon="plus" fields={fields} submitLabel="Save invoice" successMessage="Invoice entered."
      action={(v: Values) => createInvoiceAction(orderId, { invoiceNo: v.invoiceNo, invoiceDate: v.invoiceDate, dueDate: v.dueDate || null, subtotal: n(v.subtotal), tax: n(v.tax) })}
    />
  );
}

export function PaymentButton({ invoiceId, outstanding, label = "Record payment", variant = "primary" }: { invoiceId: string; outstanding?: number; label?: string; variant?: "primary" | "secondary" }) {
  const fields: FieldDef[] = [
    { name: "amount", label: "Amount paid", type: "number", required: true, unit: "₹", default: outstanding ? String(outstanding) : "", hint: outstanding !== undefined ? `Still owed: ₹${outstanding.toLocaleString("en-IN")}` : undefined },
    { name: "paidOn", label: "Paid on", type: "date", default: today() },
    { name: "mode", label: "How was it paid?", type: "select", required: true, options: PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABEL[m] })), default: "BANK_TRANSFER" },
    { name: "reference", label: "Reference (UTR / cheque no.)", type: "text" },
  ];
  return (
    <ModalForm
      title="Record payment" label={label} icon="none" variant={variant} fields={fields} submitLabel="Save payment" successMessage="Payment recorded."
      action={(v: Values) => recordPaymentAction(invoiceId, { amount: n(v.amount), paidOn: v.paidOn || null, mode: v.mode || undefined, reference: v.reference || null })}
    />
  );
}

export function ReasonButton({ label, title, kind, id, variant = "secondary" }: { label: string; title: string; kind: "rejectMr" | "cancelPo"; id: string; variant?: "secondary" | "ghost" }) {
  const fields: FieldDef[] = [{ name: "reason", label: "Reason", type: "textarea", required: true }];
  return (
    <ModalForm
      title={title} label={label} icon="none" variant={variant} fields={fields} submitLabel={label} successMessage={kind === "rejectMr" ? "Request sent back." : "Order cancelled."}
      action={(v: Values) => (kind === "rejectMr" ? rejectRequestAction(id, v.reason) : cancelPurchaseOrderAction(id, v.reason))}
    />
  );
}

// ── Store Keeper stock operations ──

export interface StockOpsData {
  projectId: string;
  materials: (Option & { unit: string; inStock: number })[];
  activities: Option[];
  locations: Option[];
  otherProjects: { id: string; label: string; locations: Option[] }[];
}

export function StockOps({ d }: { d: StockOpsData }) {
  const matOpts = d.materials.map((m) => ({ value: m.value, label: `${m.label} — ${m.inStock} ${m.unit}` }));
  const opts = { materialId: matOpts, activityId: d.activities, storageLocationId: d.locations, locationId: d.locations };
  return (
    <div className="flex flex-wrap gap-2">
      <ModalForm
        title="Issue material to an activity" label="Issue" icon="none" options={opts} submitLabel="Issue material" successMessage="Issued. Stock updated."
        fields={[
          { name: "materialId", label: "Material", type: "ref", required: true },
          { name: "quantity", label: "Quantity", type: "number", required: true },
          { name: "activityId", label: "Issued to activity", type: "ref", required: true },
          { name: "storageLocationId", label: "Take from (optional)", type: "ref", hint: "Leave empty to take from the Main Store first." },
        ]}
        action={(v) => issueStockAction(d.projectId, { materialId: v.materialId, quantity: n(v.quantity), activityId: v.activityId, storageLocationId: v.storageLocationId || null })}
      />
      <ModalForm
        title="Return unused material" label="Return" icon="none" variant="secondary" options={opts} submitLabel="Return to stock" successMessage="Returned to stock."
        fields={[
          { name: "materialId", label: "Material", type: "ref", required: true },
          { name: "quantity", label: "Quantity", type: "number", required: true },
          { name: "storageLocationId", label: "Put it back in", type: "ref", required: true },
          { name: "activityId", label: "Came back from activity (optional)", type: "ref" },
        ]}
        action={(v) => returnStockAction(d.projectId, { materialId: v.materialId, quantity: n(v.quantity), storageLocationId: v.storageLocationId, activityId: v.activityId || null })}
      />
      <TransferButton d={d} />
      <ModalForm
        title="Stock count adjustment" label="Count" icon="none" variant="secondary" options={opts} submitLabel="Save adjustment" successMessage="Adjustment saved."
        fields={[
          { name: "materialId", label: "Material", type: "ref", required: true },
          { name: "storageLocationId", label: "Location", type: "ref", required: true },
          { name: "kind", label: "What did you find?", type: "select", required: true, options: [{ value: "WASTAGE", label: "Wastage / damaged" }, { value: "THEFT_LOSS", label: "Missing / theft" }, { value: "GAIN", label: "Extra found" }] },
          { name: "quantity", label: "Quantity", type: "number", required: true },
          { name: "note", label: "Note", type: "text", required: true, hint: "A few words, e.g. bags damaged by rain." },
        ]}
        action={(v) => adjustStockAction(d.projectId, { materialId: v.materialId, storageLocationId: v.storageLocationId, kind: v.kind || undefined, quantity: n(v.quantity), note: v.note })}
      />
    </div>
  );
}

function TransferButton({ d }: { d: StockOpsData }) {
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [from, setFrom] = useState("");
  const [toProject, setToProject] = useState(d.projectId);
  const [to, setTo] = useState("");
  const projects = [{ id: d.projectId, label: "This project", locations: d.locations }, ...d.otherProjects];
  const toLocations = projects.find((p) => p.id === toProject)?.locations ?? [];
  const f = useSubmit(
    () => transferStockAction(d.projectId, { materialId: material, quantity: n(qty), fromLocationId: from, toProjectId: toProject, toLocationId: to }),
    "Transferred.",
    () => { setOpen(false); setMaterial(""); setQty(""); setFrom(""); setTo(""); setToProject(d.projectId); },
  );
  const close = () => { setOpen(false); f.reset(); };
  const err = (k: string) => f.fieldErrors[k] && <p role="alert" className="mt-1 text-sm text-danger">{f.fieldErrors[k]}</p>;
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>Transfer</Button>
      <Modal open={open} onClose={close} title="Transfer stock">
        <form onSubmit={f.submit} noValidate className="space-y-4">
          <div><Label>Material <span className="text-danger">*</span></Label>
            <SearchSelect label="Material" options={d.materials.map((m) => ({ value: m.value, label: `${m.label} — ${m.inStock} ${m.unit}` }))} value={material} onChange={setMaterial} invalid={!!f.fieldErrors.materialId} />{err("materialId")}</div>
          <div><Label htmlFor="t-qty">Quantity <span className="text-danger">*</span></Label><Input id="t-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />{err("quantity")}</div>
          <div><Label>From location <span className="text-danger">*</span></Label>
            <SearchSelect label="From location" options={d.locations} value={from} onChange={setFrom} invalid={!!f.fieldErrors.fromLocationId} />{err("fromLocationId")}</div>
          <div><Label htmlFor="t-proj">To project</Label>
            <select id="t-proj" className={selectCls} value={toProject} onChange={(e) => { setToProject(e.target.value); setTo(""); }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></div>
          <div><Label>To location <span className="text-danger">*</span></Label>
            <SearchSelect label="To location" options={toLocations} value={to} onChange={setTo} invalid={!!f.fieldErrors.toLocationId} />{err("toLocationId")}</div>
          <Footer pending={f.pending} label="Transfer" onCancel={close} error={f.error} />
        </form>
      </Modal>
    </>
  );
}
