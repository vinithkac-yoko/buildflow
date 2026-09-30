import Link from "next/link";
import { Camera, CloudRain, HardHat, ListChecks } from "lucide-react";
import type { DprStatus } from "@prisma/client";
import { can } from "@/core/auth/permissions";
import { listDprs } from "@/core/dpr/queries";
import { WEATHER_LABEL } from "@/core/dpr/schemas";
import { listProjects } from "@/core/projects/service";
import { DemoBadge, DprStatusChip } from "@/components/status-chip";
import { NoAccess } from "@/components/no-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Progress" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const STATUSES: { key: string; label: string }[] = [
  { key: "SUBMITTED", label: "Waiting for approval" }, { key: "ALL", label: "All" }, { key: "APPROVED", label: "Approved" }, { key: "REJECTED", label: "Sent back" },
];
const inputCls = "min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-[15px]";

export default async function ProgressPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx, user } = await requireSession();
  if (user.role === "CLIENT") return <NoAccess message="Your approved progress view is on its way. It arrives in a later release." />;
  if (!can(ctx, "approve", "dpr") && user.role !== "OWNER") return <NoAccess message="Daily reports from every site are reviewed here by Project Managers and the Owner. You can file yours under DPR." />;

  const sp = await searchParams;
  const projectId = one(sp.project);
  const from = one(sp.from);
  const to = one(sp.to);
  const projects = await listProjects(ctx);

  // Default to what needs a decision; fall back to everything when nothing is waiting.
  let status = one(sp.status);
  if (!status) {
    const waiting = await listDprs(ctx, { status: "SUBMITTED", projectId, take: 1 });
    status = waiting.length ? "SUBMITTED" : "ALL";
  }
  const rows = await listDprs(ctx, {
    projectId, status: status === "ALL" ? undefined : (status as DprStatus),
    from: from ? new Date(`${from}T00:00:00Z`) : undefined, to: to ? new Date(`${to}T00:00:00Z`) : undefined, take: 80,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Progress</h1>
        <p className="text-muted">Daily reports from your sites. Approving a report updates progress, labour and stock.</p>
      </div>

      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm">Status
            <select name="status" defaultValue={status} className={inputCls}>{STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          </label>
          <label className="block text-sm">Project
            <select name="project" defaultValue={projectId ?? ""} className={inputCls}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">From<input type="date" name="from" defaultValue={from ?? ""} className={inputCls} /></label>
          <label className="block text-sm">To<input type="date" name="to" defaultValue={to ?? ""} className={inputCls} /></label>
          <div className="flex items-end"><Button type="submit" className="w-full">Apply filters</Button></div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="font-medium">{status === "SUBMITTED" ? "Nothing is waiting for approval." : "No reports match these filters."}</p>
          <p className="text-muted">{status === "SUBMITTED" ? "New reports appear here as soon as an engineer submits." : "Try a wider date range or a different status."}</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
              <Link href={`/progress/${r.id}`} className="panel block p-4 hover:bg-surface-2 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="code text-sm text-muted">{r.projectCode}</span>
                    {user.role && <span className="num text-sm text-muted">· {formatDate(r.reportDate)}</span>}
                  </div>
                  <DprStatusChip status={r.status} compact />
                </div>
                <h2 className="mt-1 text-lg leading-snug">{r.projectName}</h2>
                <p className="text-[15px] text-muted">Filed by {r.engineer}</p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
                  <span className="inline-flex items-center gap-1.5"><ListChecks className="h-4 w-4 text-muted" aria-hidden /><span className="num">{r.noWork ? "No work" : `${r.activityCount} activities`}</span></span>
                  <span className="inline-flex items-center gap-1.5"><HardHat className="h-4 w-4 text-muted" aria-hidden /><span className="num">{r.mandays} mandays</span></span>
                  <span className="inline-flex items-center gap-1.5"><Camera className="h-4 w-4 text-muted" aria-hidden /><span className="num">{r.photoCount} photos</span></span>
                  {r.weather && <span className="inline-flex items-center gap-1.5"><CloudRain className="h-4 w-4 text-muted" aria-hidden />{WEATHER_LABEL[r.weather]}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">Showing up to 80 reports, newest first. {projects.some((p) => p.isDemo) && <DemoBadge />}</p>
    </div>
  );
}
