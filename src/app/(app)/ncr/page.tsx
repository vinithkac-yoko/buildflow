import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { listNcrs } from "@/core/quality/ncr";
import { NcrStatusChip, SeverityChip } from "@/components/quality/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "NCR" };

export default async function NcrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "ncr")) return <NoAccess />;
  const sp = await searchParams;
  const show = (Array.isArray(sp.show) ? sp.show[0] : sp.show) === "all" ? "all" : "open";
  const ncrs = await listNcrs(ctx, { open: show === "open" });
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div><h1 className="text-2xl md:text-3xl">Non-conformance reports</h1><p className="text-muted">Defects found in inspections, from raised to closed.</p></div>
      <nav aria-label="Filter" className="flex gap-2">
        {[["open", "Open"], ["all", "All"]].map(([k, l]) => (
          <Link key={k} href={`?show=${k}`} aria-current={show === k ? "page" : undefined}
            className={`flex min-h-12 items-center rounded-xl border-2 px-4 text-[15px] font-semibold ${show === k ? "border-brand bg-brand text-brand-on" : "border-border hover:bg-surface-2"}`}>{l}</Link>
        ))}
      </nav>
      {ncrs.length === 0 ? <Card className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>{show === "open" ? "No open NCRs." : "No NCRs yet."}</p></Card> : (
        <ul className="space-y-2">
          {ncrs.map((n) => (
            <li key={n.id}><Link href={`/ncr/${n.id}`} className="panel block p-4 hover:bg-surface-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{n.code}</span> <span className="text-muted">· {n.projectCode} {n.projectName}</span></span><span className="flex gap-2"><SeverityChip severity={n.severity} /><NcrStatusChip status={n.status} /></span></div>
              <p className="mt-1 text-[16px]">{n.defect}</p>
              <p className="mt-0.5 text-sm text-muted">{n.activity ?? "No activity"}{n.subcontractor ? ` · ${n.subcontractor}` : ""} · raised {formatDate(n.createdAt)}{n.closedAt ? ` · closed in ${n.closureHours} h` : ""}</p>
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
