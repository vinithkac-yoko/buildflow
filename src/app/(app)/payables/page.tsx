import Link from "next/link";
import { Wallet } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { listPayables } from "@/core/procurement/payables";
import { listSubBills, listWorkOrders } from "@/core/subcontract/service";
import { PaymentButton } from "@/components/procurement/office-actions";
import { SubPaymentButton } from "@/components/ops/workorder-forms";
import { InvoiceChip, fmtDate, inr } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Payables" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PayablesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "invoice") && !can(ctx, "read", "sub_bill")) return <NoAccess />;
  const sp = await searchParams;
  const show = one(sp.show) === "all" ? "all" : "open";
  const canVendors = can(ctx, "read", "invoice");
  const canSubs = can(ctx, "read", "sub_bill");
  const tab = one(sp.tab) === "subs" && canSubs ? "subs" : canVendors ? "vendors" : "subs";
  const canPay = can(ctx, "create", "payment");
  const status = show === "open" ? ({ status: "OPEN" } as const) : {};

  const vendors = tab === "vendors" ? await listPayables(ctx, status) : null;
  const subs = tab === "subs" ? await listSubBills(ctx, status) : null;
  const toBill = tab === "subs" && can(ctx, "read", "work_order") ? (await listWorkOrders(ctx)).filter((w) => (w.unbilledValue ?? 0) > 0) : [];
  const totals = vendors?.totals ?? subs!.totals;
  const q = (k: string, v: string) => `?tab=${tab}&${k}=${v}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl">Payables</h1>
        <p className="text-muted">{tab === "vendors" ? "Vendor invoices and what is still owed. Invoices are entered from the purchase order once material has been received." : "Subcontractor bills and what is still payable. Bills are raised from the work order once work has been measured."}</p>
      </div>
      {canVendors && canSubs && (
        <nav aria-label="Vendors or subcontractors" className="flex gap-2">
          {[["vendors", "Vendors"], ["subs", "Subcontractors"]].map(([k, l]) => (
            <Link key={k} href={`?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`flex min-h-12 items-center rounded-xl border-2 px-4 text-[15px] font-semibold ${tab === k ? "border-brand bg-brand text-brand-on" : "border-border hover:bg-surface-2"}`}>{l}</Link>
          ))}
        </nav>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Still owed", totals.outstanding], ["Overdue", totals.overdue], ["Paid so far", totals.paid]].map(([l, v]) => (
          <Card key={String(l)}><p className="text-sm text-muted">{l}</p><p className="num text-[26px] font-semibold">{inr(v as number)}</p></Card>
        ))}
      </div>
      <nav aria-label="Filter" className="flex gap-2">
        {[["open", tab === "vendors" ? "Unpaid" : "Unpaid bills"], ["all", "All"]].map(([k, l]) => (
          <Link key={k} href={q("show", k)} aria-current={show === k ? "page" : undefined} className={`flex min-h-12 items-center rounded-xl border-2 px-4 text-[15px] font-semibold ${show === k ? "border-brand bg-brand text-brand-on" : "border-border hover:bg-surface-2"}`}>{l}</Link>
        ))}
      </nav>

      {vendors && (vendors.items.length === 0 ? (
        <Card className="flex items-start gap-3"><Wallet className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>{show === "open" ? "Nothing is owed right now." : "No invoices yet."}</p></Card>
      ) : (
        <ul className="space-y-2">
          {vendors.items.map((v) => (
            <li key={v.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code text-[17px] font-semibold">{v.invoiceNo}</span> <span className="text-muted">· {v.vendor}</span></span><InvoiceChip status={v.status} overdue={v.overdue} /></div>
              <p className="mt-0.5 text-sm text-muted">{v.projectCode} {v.projectName} · <Link className="underline" href={`/purchase-orders/${v.orderId}`}>{v.orderCode}</Link> · invoice {fmtDate(v.invoiceDate)}{v.dueDate ? ` · due ${fmtDate(v.dueDate)}` : ""}</p>
              <p className="num mt-1 text-[16px]">Total {inr(v.invoiceTotal)} · paid {inr(v.paidAmount)} · <strong className="text-[19px]">owed {inr(v.outstanding)}</strong></p>
              {canPay && v.status !== "PAID" && <div className="mt-2"><PaymentButton invoiceId={v.id} outstanding={v.outstanding} /></div>}
            </li>
          ))}
        </ul>
      ))}

      {subs && (
        <>
          {toBill.length > 0 && (
            <section aria-labelledby="tobill" className="space-y-2">
              <h2 id="tobill" className="text-xl">Measured work waiting to be billed</h2>
              <ul className="space-y-2">
                {toBill.map((w) => (
                  <li key={w.id}><Link href={`/work-orders/${w.id}`} className="panel block p-4 hover:bg-surface-2"><span className="code font-semibold">{w.code}</span> <span className="text-muted">· {w.subcontractor} · {w.projectCode}</span><p className="num text-[16px]">{inr(w.unbilledValue)} measured, not yet billed</p></Link></li>
                ))}
              </ul>
            </section>
          )}
          {subs.items.length === 0 ? (
            <Card className="flex items-start gap-3"><Wallet className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>{show === "open" ? "No subcontractor bill is waiting to be paid." : "No subcontractor bills yet."}</p></Card>
          ) : (
            <ul className="space-y-2">
              {subs.items.map((b) => (
                <li key={b.id} className="panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code text-[17px] font-semibold">{b.billNo}</span> <span className="text-muted">· {b.subcontractor}</span></span><InvoiceChip status={b.status} overdue={b.overdue} /></div>
                  <p className="mt-0.5 text-sm text-muted">{b.projectCode} {b.projectName} · <Link className="underline" href={`/work-orders/${b.workOrderId}`}>{b.workOrderCode}</Link> · bill {fmtDate(b.billDate)}{b.dueDate ? ` · due ${fmtDate(b.dueDate)}` : ""}</p>
                  <p className="num mt-1 text-[16px]">Payable {inr(b.billNet)} · paid {inr(b.billPaid)} · <strong className="text-[19px]">owed {inr(b.outstanding)}</strong></p>
                  {canPay && b.status !== "PAID" && <div className="mt-2"><SubPaymentButton billId={b.id} outstanding={b.outstanding} /></div>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
