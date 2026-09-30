import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { listPurchaseOrders } from "@/core/procurement/purchase-orders";
import { PoChip, fmtDate, inr } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "purchase_order")) return <NoAccess />;
  const sp = await searchParams;
  const show = (Array.isArray(sp.show) ? sp.show[0] : sp.show) === "all" ? "all" : "open";
  const orders = await listPurchaseOrders(ctx, show === "open" ? { status: "OPEN" } : {});
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl">Purchase orders</h1>
        <p className="text-muted">Orders raised from the chosen quotation. Open one to see deliveries, invoices and payments.</p>
      </div>
      <nav aria-label="Filter" className="flex gap-2">
        {[["open", "Waiting for delivery"], ["all", "All orders"]].map(([k, l]) => (
          <Link key={k} href={`?show=${k}`} aria-current={show === k ? "page" : undefined}
            className={`flex min-h-12 items-center rounded-xl border-2 px-4 text-[15px] font-semibold ${show === k ? "border-brand bg-brand text-brand-on" : "border-border hover:bg-surface-2"}`}>{l}</Link>
        ))}
      </nav>
      {orders.length === 0 ? (
        <Card className="flex items-start gap-3"><PackageSearch className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>No orders here yet.</p></Card>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/purchase-orders/${o.id}`} className="panel block p-4 hover:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="code text-[17px] font-semibold">{o.code}</span> <span className="text-muted">· {o.vendor}</span></span>
                  <PoChip status={o.status} />
                </div>
                <p className="mt-1 text-sm text-muted">{o.projectCode} {o.projectName} · {o.lines} line{o.lines === 1 ? "" : "s"} · {o.receivedPct}% received{o.expectedDate ? ` · expected ${fmtDate(o.expectedDate)}` : ""}</p>
                {o.poTotal !== undefined && <p className="num mt-1 text-[18px] font-semibold">{inr(o.poTotal)}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
