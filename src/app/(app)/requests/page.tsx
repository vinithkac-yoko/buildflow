import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { listPurchaseRequests } from "@/core/procurement/orders";
import { listMaterialRequests } from "@/core/procurement/requests";
import { MrChip, PrChip, fmtDate, qty } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, user } = await requireSession();
  const canMr = can(ctx, "read", "material_request");
  const canPr = can(ctx, "read", "purchase_request");
  if (!canMr && !canPr) return <NoAccess />;
  const sp = await searchParams;
  const asked = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab = asked === "pr" && canPr ? "pr" : asked === "mr" && canMr ? "mr" : user.role === "PROCUREMENT" && canPr ? "pr" : canMr ? "mr" : "pr";
  const mine = user.role === "SITE_ENGINEER";
  const [mrs, prs] = await Promise.all([
    tab === "mr" ? listMaterialRequests(ctx, { mine }) : Promise.resolve([]),
    tab === "pr" ? listPurchaseRequests(ctx) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">{mine ? "My material requests" : "Requests"}</h1>
          <p className="text-muted">{tab === "mr" ? "What sites have asked for. The Project Manager sends approved ones to purchase." : "Purchase requests waiting for quotations, and the orders they became."}</p>
        </div>
        {can(ctx, "create", "material_request") && (
          <Link href="/requests/new" className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-brand px-5 text-[17px] font-semibold text-brand-on hover:brightness-110"><Plus className="h-5 w-5" aria-hidden />Request material</Link>
        )}
      </div>

      {canMr && canPr && (
        <nav aria-label="Request type" className="flex gap-2">
          {[["mr", "Material requests"], ["pr", "Purchase requests"]].map(([k, l]) => (
            <Link key={k} href={`?tab=${k}`} aria-current={tab === k ? "page" : undefined}
              className={`flex min-h-12 items-center rounded-xl border-2 px-4 text-[15px] font-semibold ${tab === k ? "border-brand bg-brand text-brand-on" : "border-border hover:bg-surface-2"}`}>{l}</Link>
          ))}
        </nav>
      )}

      {tab === "mr" && (mrs.length === 0 ? <Empty text="No material requests yet." /> : (
        <ul className="space-y-2">
          {mrs.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/mr/${r.id}`} className="panel block p-4 hover:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="code font-semibold">{r.code}</span> <span className="text-muted">· {r.projectCode} {r.projectName}</span></span>
                  <MrChip status={r.status} />
                </div>
                <p className="mt-1 text-[16px]">{r.items.map((i) => `${i.material} ${qty(i.quantity)} ${i.unit}`).join(", ")}</p>
                <p className="mt-0.5 text-sm text-muted">By {r.requestedBy}{r.neededBy ? ` · needed by ${fmtDate(r.neededBy)}` : ""}{r.purchaseRequest ? ` · ${r.purchaseRequest.code}` : ""}</p>
              </Link>
            </li>
          ))}
        </ul>
      ))}

      {tab === "pr" && (prs.length === 0 ? <Empty text="No purchase requests yet. They appear when a Project Manager sends a material request to purchase." /> : (
        <ul className="space-y-2">
          {prs.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/pr/${r.id}`} className="panel block p-4 hover:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="code font-semibold">{r.code}</span> <span className="text-muted">· {r.projectCode} {r.projectName}</span></span>
                  <PrChip status={r.status} />
                </div>
                <p className="mt-1 text-[16px]">{r.items.map((i) => `${i.material} ${qty(i.quantity)} ${i.unit}`).join(", ")}</p>
                <p className="mt-0.5 text-sm text-muted">{r.quotations} quotation{r.quotations === 1 ? "" : "s"}{r.selectedVendor ? ` · chosen: ${r.selectedVendor}` : ""}{r.order ? ` · ${r.order.code}` : ""}{r.neededBy ? ` · needed by ${fmtDate(r.neededBy)}` : ""}</p>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <Card className="flex items-start gap-3"><ClipboardList className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>{text}</p></Card>;
}
