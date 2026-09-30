import { can } from "@/core/auth/permissions";
import { SOURCE_LABEL } from "@/core/dpr/schemas";
import { labourSummary } from "@/core/dpr/labour";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/format";

export const metadata = { title: "Labour" };

export default async function LabourPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "labour")) return <NoAccess />;
  const rows = await labourSummary(ctx);
  const team = ctx.role === "SITE_ENGINEER";
  const showCost = rows.some((r) => r.dailyLabourCost !== undefined);

  // Group by date, then project.
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const totalMandays = rows.reduce((s, r) => s + r.mandays, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Labour</h1>
        <p className="text-muted">{team ? "Labour in today’s report." : "Labour from daily reports in the last 7 days."} <span className="num font-semibold text-text">{Math.round(totalMandays * 10) / 10} mandays</span>{showCost ? <> · <span className="num font-semibold text-text">{formatInr(rows.reduce((s, r) => s + (r.dailyLabourCost ?? 0), 0))}</span></> : null}</p>
      </div>
      {rows.length === 0 ? (
        <Card><p className="font-medium">{team ? "No labour in today’s report yet." : "No labour reported in the last 7 days."}</p><p className="text-muted">{team ? "Add labour under each activity in your daily report." : "It appears here as soon as reports are submitted."}</p></Card>
      ) : (
        [...byDay].map(([date, list]) => (
          <section key={date} aria-label={formatDate(date)} className="space-y-2">
            <h2 className="text-lg">{formatDate(date)}</h2>
            <ul className="panel divide-y divide-border">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-[15px]">
                  <span><span className="font-semibold">{r.trade}</span> · {SOURCE_LABEL[r.source]}{r.subcontractor ? ` (${r.subcontractor})` : ""}<span className="block text-sm text-muted">{r.projectCode}{r.activity ? ` · ${r.activity}` : ""}</span></span>
                  <span className="num text-right">{r.headcount} × {r.hours} h = <span className="font-semibold">{r.mandays} md</span>{r.dailyLabourCost !== undefined ? <span className="block text-sm text-muted">{formatInr(r.dailyLabourCost)}</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
