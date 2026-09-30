import Link from "next/link";
import { can } from "@/core/auth/permissions";
import { listPurchaseRequests } from "@/core/procurement/orders";
import { listPurchaseOrders } from "@/core/procurement/purchase-orders";
import { listMaterialRequests } from "@/core/procurement/requests";
import { NoAccess } from "@/components/no-access";
import { MrChip, PoChip, PrChip, fmtDate, inr, qty } from "@/components/procurement/status";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Procurement" };

export default async function ProcurementPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "purchase_order")) return <NoAccess />;
  const [mrs, prs, pos] = await Promise.all([
    can(ctx, "read", "material_request") ? listMaterialRequests(ctx) : Promise.resolve([]),
    can(ctx, "read", "purchase_request") ? listPurchaseRequests(ctx) : Promise.resolve([]),
    listPurchaseOrders(ctx),
  ]);
  const waitingMr = mrs.filter((m) => m.status === "SUBMITTED");
  const openPr = prs.filter((p) => p.status === "OPEN");
  const openPo = pos.filter((o) => o.status === "ISSUED" || o.status === "PARTIALLY_RECEIVED");
  const openValue = openPo.reduce((s, o) => s + (o.poTotal ?? 0), 0);
  const showValue = openPo.some((o) => o.poTotal !== undefined);

  const tiles = [
    { label: "Requests waiting for a PM", value: waitingMr.length, href: "/requests?tab=mr" },
    { label: "Purchase requests getting quotations", value: openPr.length, href: "/requests?tab=pr" },
    { label: "Orders waiting for delivery", value: openPo.length, href: "/purchase-orders" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Procurement</h1>
        <p className="text-muted">From site request to delivered material, across your projects.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="panel block p-4 hover:bg-surface-2">
            <p className="num text-[34px] font-semibold leading-none">{t.value}</p>
            <p className="mt-1 text-[15px] text-muted">{t.label}</p>
          </Link>
        ))}
      </div>
      {showValue && <p className="text-[15px] text-muted">Open orders total <strong className="num text-text">{inr(openValue)}</strong>.</p>}

      <section aria-labelledby="mr-h" className="space-y-2">
        <h2 id="mr-h" className="text-xl">Waiting for you</h2>
        {waitingMr.length === 0 && openPr.length === 0 ? <Card><p className="text-muted">Nothing is waiting.</p></Card> : (
          <ul className="space-y-2">
            {waitingMr.map((r) => (
              <li key={r.id}><Link href={`/requests/mr/${r.id}`} className="panel block p-4 hover:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{r.code}</span> <span className="text-muted">· {r.projectCode}</span></span><MrChip status={r.status} /></div>
                <p className="mt-1">{r.items.map((i) => `${i.material} ${qty(i.quantity)} ${i.unit}`).join(", ")}</p>
              </Link></li>
            ))}
            {openPr.map((r) => (
              <li key={r.id}><Link href={`/requests/pr/${r.id}`} className="panel block p-4 hover:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{r.code}</span> <span className="text-muted">· {r.projectCode}</span></span><PrChip status={r.status} /></div>
                <p className="mt-1">{r.items.map((i) => `${i.material} ${qty(i.quantity)} ${i.unit}`).join(", ")}</p>
                <p className="text-sm text-muted">{r.quotations} quotation{r.quotations === 1 ? "" : "s"}{r.neededBy ? ` · needed by ${fmtDate(r.neededBy)}` : ""}</p>
              </Link></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="po-h" className="space-y-2">
        <h2 id="po-h" className="text-xl">Orders on the way</h2>
        {openPo.length === 0 ? <Card><p className="text-muted">No open orders.</p></Card> : (
          <ul className="space-y-2">
            {openPo.map((o) => (
              <li key={o.id}><Link href={`/purchase-orders/${o.id}`} className="panel block p-4 hover:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{o.code}</span> <span className="text-muted">· {o.vendor} · {o.projectCode}</span></span><PoChip status={o.status} /></div>
                <p className="text-sm text-muted">{o.receivedPct}% received{o.expectedDate ? ` · expected ${fmtDate(o.expectedDate)}` : ""}</p>
              </Link></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
