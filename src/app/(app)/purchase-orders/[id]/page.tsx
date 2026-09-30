import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceButton, PaymentButton, ReasonButton, ReceiptButton } from "@/components/procurement/office-actions";
import { InvoiceChip, PoChip, fmtDate, inr, qty } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { AppError } from "@/core/errors";
import { locationOptions } from "@/core/procurement/options";
import { PAYMENT_MODE_LABEL } from "@/core/procurement/schemas";
import { getPurchaseOrder } from "@/core/procurement/purchase-orders";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Purchase order" };

export default async function PoDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let po;
  try { po = await getPurchaseOrder(ctx, id); } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") return <NoAccess />;
    throw e;
  }
  const locs = po.canReceive ? (await locationOptions([po.projectId])).get(po.projectId) ?? [] : [];
  const showRates = po.poTotal !== undefined;
  const sum = po.summary;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link href="/purchase-orders" className="text-[15px] text-muted hover:text-text">← Purchase orders</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl md:text-3xl"><span className="code">{po.code}</span></h1>
          <PoChip status={po.status} />
        </div>
        <p className="text-muted">{po.vendor.name} · {po.projectCode} {po.projectName} · ordered {fmtDate(po.orderDate)}{po.expectedDate ? ` · expected ${fmtDate(po.expectedDate)}` : ""}</p>
        {po.status === "CANCELLED" && <p className="mt-1 text-danger">Cancelled{po.cancelReason ? `: ${po.cancelReason}` : "."}</p>}
      </div>

      <Card>
        <h2 className="mb-2 text-lg">Ordered material</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-[16px]">
            <thead className="text-sm text-muted"><tr><th className="py-1.5 pr-3 font-medium">Material</th><th className="py-1.5 pr-3 text-right font-medium">Ordered</th><th className="py-1.5 pr-3 text-right font-medium">Received</th><th className="py-1.5 pr-3 text-right font-medium">Still due</th>{showRates && <th className="py-1.5 text-right font-medium">Rate</th>}{showRates && <th className="py-1.5 text-right font-medium">Amount</th>}</tr></thead>
            <tbody className="divide-y divide-border">
              {po.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 pr-3 font-medium">{l.material}</td>
                  <td className="num py-2 pr-3 text-right">{qty(l.quantity)} {l.unit}</td>
                  <td className="num py-2 pr-3 text-right">{qty(l.receivedQty)}</td>
                  <td className="num py-2 pr-3 text-right">{qty(l.remaining)}</td>
                  {showRates && <td className="num py-2 text-right">{inr(l.unitRate)}<span className="text-xs text-muted"> +{l.taxPct}%</span></td>}
                  {showRates && <td className="num py-2 text-right font-semibold">{inr(l.lineTotal)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showRates && (
          <p className="num mt-3 text-right text-[16px]">Subtotal {inr(po.poSubtotal)} · GST {inr(po.poTax)} · <strong className="text-[20px]">Total {inr(po.poTotal)}</strong></p>
        )}
        {po.terms && <p className="mt-2 text-sm text-muted">Terms: {po.terms}</p>}
      </Card>

      <div className="flex flex-wrap gap-2">
        {po.canReceive && <ReceiptButton orderId={po.id} orderCode={po.code} locations={locs} lines={po.lines} size="lg" />}
        {po.canInvoice && po.receipts.length > 0 && <InvoiceButton orderId={po.id} yetToInvoice={sum?.yetToInvoice} />}
        {po.canCancel && <ReasonButton kind="cancelPo" id={po.id} label="Cancel order" title="Cancel this order" />}
      </div>

      <Card>
        <h2 className="mb-2 text-lg">Deliveries</h2>
        {po.receipts.length === 0 ? <p className="text-muted">Nothing received yet.</p> : (
          <ul className="divide-y divide-border">
            {po.receipts.map((r) => (
              <li key={r.id} className="py-2.5">
                <div className="flex flex-wrap justify-between gap-2"><span className="code font-semibold">{r.code}</span><span className="text-sm text-muted">{fmtDate(r.receivedOn)} · into {r.location} · by {r.receivedBy}{r.challanNo ? ` · challan ${r.challanNo}` : ""}</span></div>
                <p className="text-[16px]">{r.items.map((i) => `${i.material} ${qty(i.quantity)} ${i.unit}`).join(", ")}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {po.invoices !== undefined && (po.canInvoice || po.invoices.length > 0) && (
        <Card>
          <h2 className="mb-2 text-lg">Vendor invoices and payments</h2>
          {po.invoices.length === 0 ? <p className="text-muted">No invoice entered yet.</p> : (
            <ul className="space-y-3">
              {po.invoices.map((v) => (
                <li key={v.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><span className="code font-semibold">{v.code}</span> <span className="text-muted">· invoice {v.invoiceNo} · {fmtDate(v.invoiceDate)}{v.dueDate ? ` · due ${fmtDate(v.dueDate)}` : ""}</span></span>
                    <InvoiceChip status={v.status} />
                  </div>
                  {v.invoiceTotal !== undefined && (
                    <p className="num mt-1 text-[16px]">Total <strong>{inr(v.invoiceTotal)}</strong> · paid {inr(v.paidAmount)} · <strong>owed {inr(v.outstanding)}</strong></p>
                  )}
                  {v.payments.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-sm text-muted">
                      {v.payments.map((p) => <li key={p.id}><span className="code">{p.code}</span> · {fmtDate(p.paidOn)} · {PAYMENT_MODE_LABEL[p.mode]}{p.reference ? ` · ${p.reference}` : ""} · <span className="num">{inr(p.paymentAmount)}</span></li>)}
                    </ul>
                  )}
                  {po.canPay && v.status !== "PAID" && <div className="mt-2"><PaymentButton invoiceId={v.id} outstanding={v.outstanding} /></div>}
                </li>
              ))}
            </ul>
          )}
          {sum && <p className="num mt-3 text-sm text-muted">Invoiced {inr(sum.invoiced)} · paid {inr(sum.paid)} · owed {inr(sum.outstanding)} · not yet invoiced {inr(sum.yetToInvoice)}</p>}
        </Card>
      )}
    </div>
  );
}
