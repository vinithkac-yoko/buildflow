import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { listInspections } from "@/core/quality/inspections";
import { listNcrs, qualityOverview } from "@/core/quality/ncr";
import { NcrStatusChip, ResultChip, SeverityChip } from "@/components/quality/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Quality" };

export default async function QualityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, user } = await requireSession();
  if (!can(ctx, "read", "inspection")) return <NoAccess />;
  const sp = await searchParams;
  const projectId = Array.isArray(sp.project) ? sp.project[0] : sp.project;
  const site = user.role === "SITE_ENGINEER";
  const [ov, ncrs, inspections] = await Promise.all([
    qualityOverview(ctx),
    can(ctx, "read", "ncr") ? listNcrs(ctx, { open: true, projectId }) : Promise.resolve([]),
    listInspections(ctx, { projectId, ...(site ? { mine: true } : {}) }),
  ]);
  const cards: [string, number, string][] = [
    ["Critical NCRs open", ov.openNcr.CRITICAL, "danger"], ["Major NCRs open", ov.openNcr.MAJOR, "warn"], ["Minor NCRs open", ov.openNcr.MINOR, "slate"],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">Quality</h1>
          <p className="text-muted">{site ? "Ask for an inspection when work is ready, and see how your requests went." : "Open non-conformances and recent inspections across your projects."}</p>
        </div>
        {can(ctx, "create", "inspection") && (
          <Link href="/inspections/request" className="inline-flex min-h-14 items-center rounded-xl bg-brand px-5 text-[17px] font-semibold text-brand-on hover:brightness-110">Request an inspection</Link>
        )}
      </div>

      {!site && (
        <div className="grid gap-3 sm:grid-cols-3">
          {cards.map(([l, v]) => (
            <Link key={l} href="/ncr" className="panel block p-4 hover:bg-surface-2"><p className="num text-[34px] font-semibold leading-none">{v}</p><p className="mt-1 text-[15px] text-muted">{l}</p></Link>
          ))}
        </div>
      )}
      {!site && (
        <p className="text-[15px] text-muted">
          {ov.inspections.total} inspection{ov.inspections.total === 1 ? "" : "s"} done: {ov.inspections.pass} pass, {ov.inspections.conditional} conditional, {ov.inspections.rejected} rejected.
          {ov.requested > 0 ? ` ${ov.requested} waiting for the inspector.` : ""}{ov.avgClosureHours !== null ? ` NCRs close in about ${Math.round(ov.avgClosureHours / 24 * 10) / 10} days on average.` : ""}
        </p>
      )}

      {can(ctx, "read", "ncr") && !site && (
        <section aria-labelledby="ncr-h" className="space-y-2">
          <h2 id="ncr-h" className="text-xl">Open NCRs</h2>
          {ncrs.length === 0 ? <Card><p className="text-muted">No open NCRs.</p></Card> : (
            <ul className="space-y-2">
              {ncrs.map((n) => (
                <li key={n.id}><Link href={`/ncr/${n.id}`} className="panel block p-4 hover:bg-surface-2">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{n.code}</span> <span className="text-muted">· {n.projectCode}{n.activity ? ` · ${n.activity}` : ""}</span></span><span className="flex gap-2"><SeverityChip severity={n.severity} /><NcrStatusChip status={n.status} /></span></div>
                  <p className="mt-1 text-[16px]">{n.defect}</p>
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="insp-h" className="space-y-2">
        <h2 id="insp-h" className="text-xl">{site ? "My inspection requests" : "Recent inspections"}</h2>
        {inspections.length === 0 ? <Card className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>Nothing yet.</p></Card> : (
          <ul className="space-y-2">
            {inspections.slice(0, 12).map((i) => (
              <li key={i.id}><Link href={`/inspections/${i.id}`} className="panel block p-4 hover:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{i.code}</span> <span className="text-muted">· {i.projectCode} · {i.checklist}</span></span><ResultChip result={i.result} /></div>
                <p className="mt-1 text-sm text-muted">{i.activity}{i.date ? ` · ${formatDate(i.date)}` : ""}{i.status === "COMPLETED" ? ` · ${i.passed} of ${i.total} pass` : ""}</p>
              </Link></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
