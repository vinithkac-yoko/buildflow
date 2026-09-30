import Link from "next/link";
import { Flame } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { engineerReport } from "@/core/dpr/queries";
import { listProjects } from "@/core/projects/service";
import { Card } from "@/components/ui/card";
import { ActivityStatusChip } from "@/components/status-chip";
import { NoAccess } from "@/components/no-access";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Today's Work" };

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export default async function TodaysWorkPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "activity")) return <NoAccess />;
  const projects = (await listProjects(ctx)).filter((p) => p.status === "ACTIVE" || p.status === "DELAYED");
  const reports = await Promise.all(projects.map((p) => engineerReport(ctx, p.id)));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl">Today&apos;s Work</h1>
      {reports.length === 0 && <Card><p className="text-[17px] font-medium">No active projects.</p><p className="text-muted">Work for today shows up here once a project is active.</p></Card>}
      {reports.map((r) => {
        const todays = r.activities.filter((a) => a.today);
        return (
          <section key={r.project.id} aria-labelledby={`p-${r.project.id}`} className="space-y-3">
            <div>
              <div className="code text-sm text-muted">{r.project.code}</div>
              <h2 id={`p-${r.project.id}`} className="text-xl leading-snug">{r.project.name}</h2>
              <p className="text-[15px] text-muted">{formatDate(r.reportDate)}</p>
            </div>
            {todays.length === 0 ? (
              <Card><p className="text-[17px]">Nothing is planned for today.</p></Card>
            ) : (
              <ul className="space-y-3">
                {todays.map((a) => {
                  const pct = Math.min(100, (a.actualQty / a.plannedQty) * 100);
                  return (
                    <li key={a.id} className="panel p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[18px] leading-snug">{a.name}</h3>
                        <ActivityStatusChip status={a.status as "NOT_STARTED" | "IN_PROGRESS" | "HALTED" | "COMPLETED"} />
                      </div>
                      <p className="mt-0.5 text-[15px] text-muted">{a.wbs}{a.tradeName ? ` · ${a.tradeName}` : ""}</p>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${Math.round(pct)} percent of planned quantity done`}>
                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="num mt-2 text-[17px]"><span className="font-semibold">{fmt(a.actualQty)}</span> of {fmt(a.plannedQty)} {a.unit} done <span className="text-muted">· {fmt(Math.max(0, a.plannedQty - a.actualQty))} left</span></p>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href={`/dpr/${r.project.id}`} className="flex min-h-16 w-full items-center justify-center rounded-xl bg-brand text-[17px] font-bold text-brand-on hover:brightness-110">
              {r.dpr?.status === "SUBMITTED" || r.dpr?.status === "APPROVED" ? "View today’s report" : r.dpr ? "Continue today’s report" : "Start today’s report"}
            </Link>
          </section>
        );
      })}
      <p className="text-center text-sm text-muted"><Flame className="mr-1 inline h-4 w-4" aria-hidden />Work planned for today, plus anything already in progress.</p>
    </div>
  );
}
