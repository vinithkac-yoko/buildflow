import Link from "next/link";
import { Wallet } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { listPayables } from "@/core/procurement/payables";
import { PaymentButton } from "@/components/procurement/office-actions";
import { InvoiceChip, fmtDate, inr } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Payables" };

export default async function PayablesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "invoice")) return <NoAccess />;
  const sp = await searchParams;
  const show = (Array.isArray(sp.show) ? sp.show[0] : sp.show) === "all" ? "all" : "open";
  const { items, totals } = await listPayables(ctx, show === "open" ? { status: "OPEN" } : {});
  const canPay = can(ctx, "create", "payment");
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl">Payables</h1>
        <p className="text-muted">Vendor invoices and what is still owed. Invoices are entered from the purchase order once material has been received.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Still owed", totals.outstanding], ["Overdue", totals.overdue], ["Paid so far", totals.paid]].map(([l, v]) => (
          <Card key={String(l)}><p className="text-sm text-muted">{l}</p><p className="num text-[26px] font-semibold">{inr(v as number)}</p></Card>
        ))}
      </div>
      <nav aria-label="Filter" className="flex gap-2">
        {[["open", "Unpaid"], ["all", "All invoices"]].map(([k, l]) => (
          <Link key={k} href={`?show=${k}`} aria-current={show === k ? "page" : undefined}
            className={`flex min-h-12 items-center rounded-xl border-2 px-4 text-[15px] font-semibold ${show === k ? "border-brand bg-brand text-brand-on" : "border-border hover:bg-surface-2"}`}>{l}</Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <Card className="flex items-start gap-3"><Wallet className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>{show === "open" ? "Nothing is owed right now." : "No invoices yet."}</p></Card>
      ) : (
        <ul className="space-y-2">
          {items.map((v) => (
            <li key={v.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><span className="code text-[17px] font-semibold">{v.invoiceNo}</span> <span className="text-muted">· {v.vendor}</span></span>
                <InvoiceChip status={v.status} overdue={v.overdue} />
              </div>
              <p className="mt-0.5 text-sm text-muted">{v.projectCode} {v.projectName} · <Link className="underline" href={`/purchase-orders/${v.orderId}`}>{v.orderCode}</Link> · invoice {fmtDate(v.invoiceDate)}{v.dueDate ? ` · due ${fmtDate(v.dueDate)}` : ""}</p>
              <p className="num mt-1 text-[16px]">Total {inr(v.invoiceTotal)} · paid {inr(v.paidAmount)} · <strong className="text-[19px]">owed {inr(v.outstanding)}</strong></p>
              {canPay && v.status !== "PAID" && <div className="mt-2"><PaymentButton invoiceId={v.id} outstanding={v.outstanding} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
