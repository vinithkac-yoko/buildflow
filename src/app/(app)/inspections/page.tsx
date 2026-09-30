import Link from "next/link";
import { can } from "@/core/auth/permissions";
import { listInspections } from "@/core/quality/inspections";
import { ResultChip } from "@/components/quality/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Inspections" };

export default async function InspectionsPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "inspection")) return <NoAccess />;
  const all = await listInspections(ctx);
  const waiting = all.filter((i) => i.status === "REQUESTED");
  const done = all.filter((i) => i.status === "COMPLETED");
  const canRun = can(ctx, "update", "inspection");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl md:text-3xl">Inspections</h1><p className="text-muted">Requests from site, and inspections already done.</p></div>
        {canRun && <Link href="/inspections/new" className="inline-flex min-h-14 items-center rounded-xl bg-brand px-5 text-[17px] font-semibold text-brand-on hover:brightness-110">New inspection</Link>}
      </div>

      <section aria-labelledby="wait-h" className="space-y-2">
        <h2 id="wait-h" className="text-xl">Waiting for you</h2>
        {waiting.length === 0 ? <Card><p className="text-muted">No requests waiting.</p></Card> : (
          <ul className="space-y-2">
            {waiting.map((i) => (
              <li key={i.id} className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{i.code}</span> <span className="text-muted">· {i.projectCode} {i.projectName}</span></span><ResultChip result={null} /></div>
                <p className="mt-1 text-[16px]">{i.activity} — {i.checklist}</p>
                <p className="text-sm text-muted">Requested by {i.requestedBy ?? "—"}{i.requestNote ? ` · “${i.requestNote}”` : ""}</p>
                {canRun && <Link href={`/inspections/new?request=${i.id}`} className="mt-3 inline-flex min-h-14 items-center rounded-xl bg-brand px-5 text-[17px] font-semibold text-brand-on hover:brightness-110">Start inspection</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="done-h" className="space-y-2">
        <h2 id="done-h" className="text-xl">Done</h2>
        {done.length === 0 ? <Card><p className="text-muted">No inspections yet.</p></Card> : (
          <ul className="space-y-2">
            {done.map((i) => (
              <li key={i.id}><Link href={`/inspections/${i.id}`} className="panel block p-4 hover:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{i.code}</span> <span className="text-muted">· {i.projectCode} · {i.checklist}</span></span><ResultChip result={i.result} /></div>
                <p className="mt-1 text-sm text-muted">{i.activity} · {i.date ? formatDate(i.date) : ""} · {i.passed} of {i.total} pass{i.ncr ? ` · ${i.ncr.code}` : ""}</p>
              </Link></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
