import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { locationOptions } from "@/core/procurement/options";
import { getPurchaseOrder, listPurchaseOrders } from "@/core/procurement/purchase-orders";
import { listReceipts } from "@/core/procurement/receipts";
import { ReceiptButton } from "@/components/procurement/office-actions";
import { PoChip, fmtDate, qty } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Receipts" };

export default async function ReceiptsPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "receipt")) return <NoAccess />;
  const [open, receipts] = await Promise.all([can(ctx, "read", "purchase_order") ? listPurchaseOrders(ctx, { status: "OPEN" }) : Promise.resolve([]), listReceipts(ctx)]);
  const details = await Promise.all(open.map((o) => getPurchaseOrder(ctx, o.id)));
  const locs = await locationOptions([...new Set(open.map((o) => o.projectId))]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl">Receipts</h1>
        <p className="text-muted">Record what a supplier delivered. Stock goes up as soon as you save; a part delivery is fine.</p>
      </div>

      <section aria-labelledby="waiting" className="space-y-2">
        <h2 id="waiting" className="text-xl">Waiting for delivery</h2>
        {details.length === 0 ? (
          <Card className="flex items-start gap-3"><PackageCheck className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>Nothing is waiting. Orders appear here once Procurement raises them.</p></Card>
        ) : (
          <ul className="space-y-2">
            {details.map((o) => (
              <li key={o.id} className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><Link href={`/purchase-orders/${o.id}`} className="code inline-flex min-h-11 items-center text-[17px] font-semibold underline">{o.code}</Link> <span className="text-muted">· {o.vendor.name} · {o.projectCode}</span></span>
                  <PoChip status={o.status} />
                </div>
                <ul className="mt-2 space-y-0.5 text-[16px]">
                  {o.lines.filter((l) => l.remaining > 0).map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.material}</span><span className="num text-muted">due {qty(l.remaining)} of {qty(l.quantity)} {l.unit}</span></li>)}
                </ul>
                {o.expectedDate && <p className="mt-1 text-sm text-muted">Expected {fmtDate(o.expectedDate)}</p>}
                {o.canReceive && <div className="mt-3"><ReceiptButton orderId={o.id} orderCode={o.code} locations={locs.get(o.projectId) ?? []} lines={o.lines} size="lg" /></div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent" className="space-y-2">
        <h2 id="recent" className="text-xl">Recent receipts</h2>
        {receipts.length === 0 ? <Card><p className="text-muted">No receipts yet.</p></Card> : (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li key={r.id} className="panel p-4">
                <div className="flex flex-wrap justify-between gap-2"><span><span className="code font-semibold">{r.code}</span> <span className="text-muted">· {r.orderCode} · {r.vendor}</span></span><span className="text-sm text-muted">{fmtDate(r.receivedOn)}</span></div>
                <p className="mt-1 text-[16px]">{r.items.map((i) => `${i.material} ${qty(i.quantity)} ${i.unit}`).join(", ")}</p>
                <p className="text-sm text-muted">{r.projectCode} · into {r.location} · by {r.receivedBy}{r.challanNo ? ` · challan ${r.challanNo}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
