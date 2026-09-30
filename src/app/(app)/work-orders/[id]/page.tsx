import Link from "next/link";
import { notFound } from "next/navigation";
import { BillButton, CancelWorkOrderButton, MeasureButton, SubPaymentButton } from "@/components/ops/workorder-forms";
import { InvoiceChip, inr, qty } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AppError } from "@/core/errors";
import { PAYMENT_MODE_LABEL } from "@/core/procurement/schemas";
import { WO_STATUS_LABEL, getWorkOrder } from "@/core/subcontract/service";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Work order" };

export default async function WorkOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let w;
  try { w = await getWorkOrder(ctx, id); } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") return <NoAccess />;
    throw e;
  }
  const money = w.workTotal !== undefined;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link href="/work-orders" className="text-[15px] text-muted hover:text-text">← Work orders</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl md:text-3xl"><span className="code">{w.code}</span></h1><Badge tone={w.status === "CANCELLED" ? "slate" : w.status === "COMPLETED" ? "ok" : "plan"}>{WO_STATUS_LABEL[w.status]}</Badge></div>
        <p className="text-[17px]">{w.title}</p>
        <p className="text-muted">{w.subcontractor.name} · {w.projectCode} {w.projectName} · issued {formatDate(w.issuedOn)} by {w.issuedBy}</p>
        {w.status === "CANCELLED" && <p className="mt-1 text-danger">Cancelled{w.cancelReason ? `: ${w.cancelReason}` : "."}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {w.canMeasure && <MeasureButton workOrderId={w.id} items={w.items.map((i) => ({ id: i.id, description: i.description, unit: i.unit, remaining: i.remaining }))} />}
        {w.canBill && <BillButton workOrderId={w.id} unbilledValue={w.summary?.unbilledValue} />}
        {w.canCancel && <CancelWorkOrderButton workOrderId={w.id} />}
      </div>

      <Card>
        <h2 className="mb-2 text-lg">Work and measurement</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-[16px]">
            <thead className="text-sm text-muted"><tr><th className="py-1.5 pr-3 font-medium">Activity</th><th className="py-1.5 pr-3 text-right font-medium">Ordered</th><th className="py-1.5 pr-3 text-right font-medium">Measured</th><th className="py-1.5 pr-3 text-right font-medium">Left</th>{money && <th className="py-1.5 pr-3 text-right font-medium">Rate</th>}{money && <th className="py-1.5 text-right font-medium">Value</th>}</tr></thead>
            <tbody className="divide-y divide-border">
              {w.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-3"><div className="font-medium">{i.description}</div><div className="text-sm text-muted">{i.activity}</div></td>
                  <td className="num py-2 pr-3 text-right">{qty(i.quantity)} {i.unit}</td>
                  <td className="num py-2 pr-3 text-right">{qty(i.measuredQty)}</td>
                  <td className="num py-2 pr-3 text-right">{qty(i.remaining)}</td>
                  {money && <td className="num py-2 pr-3 text-right">{inr(i.workRate)}</td>}
                  {money && <td className="num py-2 text-right font-semibold">{inr(i.workAmount)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {money && <p className="num mt-3 text-right text-[18px] font-semibold">Order value {inr(w.workTotal)}</p>}
        {w.items.some((i) => i.measurements.length > 0) && (
          <details className="mt-3"><summary className="min-h-11 cursor-pointer text-[15px] font-semibold">Measurement history</summary>
            <ul className="mt-2 space-y-1 text-[15px]">
              {w.items.flatMap((i) => i.measurements.map((m) => <li key={m.id}>{formatDate(m.on)} · {i.description}: <span className="num font-medium">{qty(m.quantity)} {i.unit}</span> · {m.by}{m.billed ? " · billed" : " · not yet billed"}{m.note ? ` · ${m.note}` : ""}</li>))}
            </ul>
          </details>
        )}
      </Card>

      {(w.bills.length > 0 || w.canBill) && (
        <Card>
          <h2 className="mb-2 text-lg">Bills and payments</h2>
          {w.bills.length === 0 ? <p className="text-muted">No bill raised yet.</p> : (
            <ul className="space-y-3">
              {w.bills.map((b) => (
                <li key={b.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{b.code}</span> <span className="text-muted">· bill {b.billNo} · {formatDate(b.billDate)}{b.dueDate ? ` · due ${formatDate(b.dueDate)}` : ""}</span></span><InvoiceChip status={b.status} /></div>
                  {b.billNet !== undefined && <p className="num mt-1 text-[16px]">Gross {inr(b.billGross)} − retention {b.retentionPct}% {inr(b.billRetention)} = <strong>payable {inr(b.billNet)}</strong> · paid {inr(b.billPaid)} · <strong>owed {inr(b.outstanding)}</strong></p>}
                  {b.payments.length > 0 && <ul className="mt-1 space-y-0.5 text-sm text-muted">{b.payments.map((p) => <li key={p.id}><span className="code">{p.code}</span> · {formatDate(p.paidOn)} · {PAYMENT_MODE_LABEL[p.mode]}{p.reference ? ` · ${p.reference}` : ""} · <span className="num">{inr(p.subPaymentAmount)}</span></li>)}</ul>}
                  {w.canPay && b.status !== "PAID" && <div className="mt-2"><SubPaymentButton billId={b.id} outstanding={b.outstanding} /></div>}
                </li>
              ))}
            </ul>
          )}
          {w.summary && <p className="num mt-3 text-sm text-muted">Billed {inr(w.summary.billed)} · paid {inr(w.summary.paid)} · owed {inr(w.summary.outstanding)} · measured, not yet billed {inr(w.summary.unbilledValue)}</p>}
        </Card>
      )}
    </div>
  );
}
