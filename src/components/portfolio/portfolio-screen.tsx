import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronDown, ClipboardList, Flame, PackageMinus, PauseCircle, ShieldAlert } from "lucide-react";
import { portfolioCurves, portfolioProgress, healthFormula, type AttentionItem, type ProjectProgress } from "@/core/progress/service";
import type { ScheduleBand } from "@/core/progress/calc";
import { DemoBadge, ProjectStatusChip } from "@/components/status-chip";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { daysLabel, formatDate, formatInr, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BAND, BandChip, DualBar, HealthChip, InfoTip, rank } from "./parts";
import { SCurve } from "./scurve";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const KIND_ICON: Record<AttentionItem["kind"], typeof Flame> = {
  BEHIND_ACTIVITY: Flame, PENDING_DPR: ClipboardList, MISSING_DPR: CalendarClock, NCR: ShieldAlert, CRITICAL_ISSUE: AlertTriangle, LOW_STOCK: PackageMinus,
};
const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  BEHIND_ACTIVITY: "Behind schedule", PENDING_DPR: "Waiting for approval", MISSING_DPR: "Missing report", NCR: "NCR", CRITICAL_ISSUE: "Issue", LOW_STOCK: "Low stock",
};
const STATUS_FILTERS = [
  { key: "active", label: "Active" }, { key: "planning", label: "Planning" }, { key: "hold", label: "On hold" }, { key: "all", label: "All" },
];
const inScope = (p: ProjectProgress, f: string) =>
  f === "all" ? true : f === "planning" ? p.status === "PLANNING" : f === "hold" ? p.status === "ON_HOLD" : p.status === "ACTIVE" || p.status === "DELAYED";
const isLive = (p: ProjectProgress) => p.status === "ACTIVE" || p.status === "DELAYED";
const SEG: Record<ScheduleBand, string> = { AHEAD: "bg-brand", ON_TRACK: "bg-brand", SLIGHTLY_BEHIND: "bg-warn", BEHIND: "bg-danger", NOT_STARTED: "bg-surface-2" };
const VISIBLE_ATTENTION = 6;

/** Owner / PM home: every site's planned vs actual progress, what needs attention, and how fresh the data is. */
export async function PortfolioScreen({ searchParams }: { searchParams: SP }) {
  const { ctx, user } = await requireSession();
  const data = await portfolioProgress(ctx);
  const status = one(searchParams.status) ?? "active";
  const pmFilter = one(searchParams.pm);
  const view = one(searchParams.view) ?? (user.role === "OWNER" ? "pm" : "flat");

  const scoped = data.projects.filter((p) => inScope(p, status) && (!pmFilter || p.pmId === pmFilter));
  const curves = await portfolioCurves(ctx, scoped.filter((p) => p.status !== "PLANNING").map((p) => p.projectId));
  const pms = [...new Map(data.projects.filter((p) => p.pmId).map((p) => [p.pmId!, p.pmName!])).entries()];

  const live = data.projects.filter(isLive);
  const count = (bands: ScheduleBand[]) => live.filter((p) => bands.includes(p.band)).length;
  const onTrack = count(["ON_TRACK", "AHEAD"]);
  const slight = count(["SLIGHTLY_BEHIND"]);
  const behind = count(["BEHIND"]);
  const waiting = data.projects.reduce((s, p) => s + p.pendingReports, 0);
  const totalValue = data.projects.some((p) => p.contractValue !== undefined) ? data.projects.reduce((s, p) => s + Number(p.contractValue ?? 0), 0) : null;
  const attention = data.attention.filter((a) => !pmFilter || scoped.some((p) => p.projectId === a.projectId));

  const healthTip = healthFormula();
  const sorted = [...scoped].sort((a, b) => rank(a) - rank(b));
  const groups = view === "pm"
    ? [...new Map(sorted.map((p) => [p.pmId ?? "none", p.pmName ?? "No PM assigned"])).entries()].map(([k, name]) => ({ key: k, name, items: sorted.filter((p) => (p.pmId ?? "none") === k) }))
    : [{ key: "all", name: "", items: sorted }];

  const linkTo = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { status: one(searchParams.status), pm: pmFilter, view: one(searchParams.view), ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };
  const pill = (on: boolean, tone: "brand" | "planned" = "brand") => cn("flex min-h-12 items-center rounded-xl border px-3.5 text-[15px] font-semibold", on ? (tone === "brand" ? "border-brand bg-brand text-brand-on" : "border-planned text-planned") : "border-border hover:bg-surface-2");

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      {/* Freshness: the replacement for chasing updates on WhatsApp */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" aria-live="polite">
        <h1 className="text-2xl md:text-3xl">Portfolio progress</h1>
        <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
          <span aria-hidden className="h-2.5 w-2.5 animate-pulse-dot rounded-full bg-brand" />
          {data.freshness.approvedToday > 0
            ? <>Updated from <span className="num font-semibold">{data.freshness.approvedToday}</span> approved report{data.freshness.approvedToday === 1 ? "" : "s"} today · last update <span className="num font-semibold">{data.freshness.lastUpdate ? formatTime(data.freshness.lastUpdate) : "—"}</span></>
            : <>No reports approved yet today</>}
        </p>
      </header>

      {/* Verdict: one sentence, one bar with a segment per live site */}
      <section aria-label="Portfolio summary" className="space-y-3">
        <p className="text-[22px] leading-snug md:text-[26px]">
          <span className="num font-semibold text-brand-text">{onTrack}</span> of <span className="num font-semibold">{live.length}</span> live sites on track or ahead
          {slight > 0 && <> · <span className="num font-semibold text-warn">{slight}</span> slightly behind</>}
          {behind > 0 && <> · <span className="num font-semibold text-danger">{behind}</span> behind</>}
        </p>
        <ul className="-my-2 flex gap-1" aria-label="Live sites by schedule status">
          {[...live].sort((a, b) => rank(a) - rank(b)).map((p) => (
            <li key={p.projectId} className="min-w-0 flex-1">
              <Link href={`/projects/${p.projectId}`} title={`${p.code} ${p.name}: ${BAND[p.band].label}`} aria-label={`${p.code} ${p.name}: ${BAND[p.band].label}`} className="flex min-h-11 items-center"><span className={cn("block h-3 w-full rounded-full", SEG[p.band])} /></Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          {waiting > 0 ? <><span className="num font-semibold text-text">{waiting}</span> daily report{waiting === 1 ? "" : "s"} waiting for approval · </> : null}
          <span className="num font-semibold text-text">{attention.length}</span> item{attention.length === 1 ? "" : "s"} need attention
          {totalValue !== null && <> · contract value across all projects <span className="num font-semibold text-text">{formatInr(totalValue)}</span></>}
        </p>
      </section>

      {/* Needs attention: exceptions first */}
      <section aria-labelledby="attention" className="space-y-2">
        <h2 id="attention" className="text-lg">Needs attention</h2>
        {attention.length === 0 ? (
          <Card><p className="font-medium">Nothing needs attention right now.</p><p className="text-muted">Behind-schedule activities, missing or waiting reports, serious issues, NCRs and low stock will show up here.</p></Card>
        ) : (
          <>
            <ul className="grid gap-x-6 md:grid-cols-2 md:[&>li:nth-child(n+3)]:border-t-0"><AttentionList items={attention.slice(0, VISIBLE_ATTENTION)} /></ul>
            {attention.length > VISIBLE_ATTENTION && (
              <details className="group">
                <summary className="inline-flex min-h-12 cursor-pointer items-center gap-1 text-[15px] font-semibold text-brand-text"><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden /> Show {attention.length - VISIBLE_ATTENTION} more</summary>
                <ul className="grid gap-x-6 md:grid-cols-2"><AttentionList items={attention.slice(VISIBLE_ATTENTION)} /></ul>
              </details>
            )}
          </>
        )}
      </section>

      {/* Projects */}
      <section aria-label="Projects" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg">Projects</h2>
            <InfoTip label="How progress is calculated">
              <p className="font-semibold">How progress is measured</p>
              <p className="mt-1"><b>Actual %</b> = each activity&apos;s approved quantity ÷ planned quantity, weighted by planned cost (or planned mandays when cost isn&apos;t available).</p>
              <p className="mt-1"><b>Plan %</b> = where the plan says the work should be today, interpolated between each activity&apos;s planned start and finish.</p>
              <p className="mt-1"><b>Days ahead/behind</b> = when the plan reached today&apos;s actual %, compared with today.</p>
            </InfoTip>
            <InfoTip label="How health is scored"><p className="font-semibold">How health is scored (0–100)</p><p className="mt-1">{healthTip}</p><p className="mt-1">75 and above is Healthy, 50–74 Watch, below 50 At risk.</p></InfoTip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Status filter" className="flex gap-1">
              {STATUS_FILTERS.map((f) => <Link key={f.key} href={linkTo({ status: f.key === "active" ? undefined : f.key })} aria-current={status === f.key ? "page" : undefined} className={pill(status === f.key)}>{f.label}</Link>)}
            </nav>
            {user.role === "OWNER" && pms.length > 1 && (
              <form method="get" className="flex items-center gap-1">
                {status !== "active" && <input type="hidden" name="status" value={status} />}
                {one(searchParams.view) && <input type="hidden" name="view" value={one(searchParams.view)} />}
                <label className="sr-only" htmlFor="pm">Project manager</label>
                <select id="pm" name="pm" defaultValue={pmFilter ?? ""} className="min-h-12 rounded-xl border border-border bg-bg px-3 text-[15px]"><option value="">All PMs</option>{pms.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
                <button type="submit" className="min-h-12 cursor-pointer rounded-xl border border-border px-3.5 text-[15px] font-semibold hover:bg-surface-2">Filter</button>
              </form>
            )}
            {user.role === "OWNER" && (
              <nav aria-label="View" className="flex gap-1">
                <Link href={linkTo({ view: undefined })} aria-current={view === "pm" ? "page" : undefined} className={pill(view === "pm", "planned")}>By PM</Link>
                <Link href={linkTo({ view: "flat" })} aria-current={view === "flat" ? "page" : undefined} className={pill(view === "flat", "planned")}>Worst first</Link>
              </nav>
            )}
          </div>
        </div>

        {scoped.length === 0 ? (
          <Card><p className="font-medium">No projects match these filters.</p><p className="text-muted">Try “All” to see every project.</p></Card>
        ) : (
          groups.map((g) => {
            const gl = g.items.filter(isLive);
            const on = gl.filter((p) => p.band === "ON_TRACK" || p.band === "AHEAD").length;
            const sl = gl.filter((p) => p.band === "SLIGHTLY_BEHIND").length;
            const bh = gl.filter((p) => p.band === "BEHIND").length;
            const list = (
              <ul className="panel divide-y divide-border">{g.items.map((p) => <ProjectRow key={p.projectId} p={p} curve={curves.get(p.projectId)} healthTip={healthTip} />)}</ul>
            );
            return view === "pm" ? (
              <details key={g.key} open className="group space-y-2">
                <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-1">
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                  <span className="text-[17px] font-semibold">{g.name}</span>
                  <span className="num text-sm text-muted">{g.items.length} site{g.items.length === 1 ? "" : "s"}{gl.length > 0 ? <> · <span className="text-brand-text">{on} on track</span>{sl > 0 && <> · <span className="text-warn">{sl} slightly behind</span></>}{bh > 0 && <> · <span className="text-danger">{bh} behind</span></>}</> : null}</span>
                </summary>
                {list}
              </details>
            ) : <div key={g.key}>{list}</div>;
          })
        )}
      </section>
    </div>
  );
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <>
      {items.map((a, i) => {
        const Icon = KIND_ICON[a.kind];
        return (
          <li key={`${a.kind}-${a.projectId}-${i}`} className="border-t border-border first:border-t-0">
            <Link href={a.href} className="flex min-h-14 items-start gap-3 py-3 hover:bg-surface-2/60">
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", a.priority === 1 ? "text-danger" : "text-warn")} aria-hidden />
              <div className="min-w-0">
                <p className="text-[16px] font-medium leading-snug">{a.title}</p>
                <p className="text-sm text-muted">
                  <span className={cn("font-semibold", a.priority === 1 ? "text-danger" : "text-warn")}>{a.priority === 1 ? "Act now" : "Soon"}</span> · {KIND_LABEL[a.kind]} · <span className="code">{a.projectCode}</span> · {a.detail}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </>
  );
}

/** One site: a single line on a laptop (dual bar, S-curve, finish, health), a compact card on a phone. */
function ProjectRow({ p, curve, healthTip }: { p: ProjectProgress; curve?: { date: string; planned: number; actual: number }[]; healthTip: string }) {
  const live = isLive(p);
  const slipDays = Math.round((new Date(p.currentFinish).getTime() - new Date(p.baselineFinish).getTime()) / 86_400_000);
  const slipWeeks = Math.round(slipDays / 7);
  return (
    <li aria-label={p.name} className="grid gap-x-5 gap-y-2 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.5fr)_150px_minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="code text-sm text-muted">{p.code}</span>
          {p.isDemo && <DemoBadge />}
          {!live && <ProjectStatusChip status={p.status} />}
        </div>
        <Link href={`/projects/${p.projectId}`} className="flex min-h-11 items-center text-[18px] font-semibold leading-snug hover:underline">{p.name}</Link>
        <p className="text-sm text-muted">{p.clientName}{p.contractValue !== undefined ? <> · <span className="num font-semibold text-text">{formatInr(p.contractValue)}</span></> : null}{p.pmName ? ` · ${p.pmName.replace("Demo ", "")}` : ""}</p>
      </div>

      <div>
        {live || p.actualPct > 0 ? (
          <>
            <DualBar planned={p.plannedPct} actual={p.actualPct} label={p.name} />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
              <BandChip band={p.band} />
              {live && <span className={cn("num text-sm font-semibold", p.daysAheadBehind < 0 ? "text-danger" : "text-brand-text")}>{daysLabel(p.daysAheadBehind)}</span>}
            </div>
          </>
        ) : <p className="inline-flex items-center gap-2 text-sm text-muted"><PauseCircle className="h-4 w-4" aria-hidden /> {p.status === "PLANNING" ? "In planning — no site progress yet." : "No progress recorded."}</p>}
      </div>

      <div className="hidden lg:block">
        {curve && curve.length > 1 ? <SCurve id={p.projectId} data={curve} height={52} compact summary={`${p.name}: plan ${p.plannedPct}%, actual ${p.actualPct}%`} /> : null}
      </div>

      <div className="min-w-0 space-y-0.5 text-sm">
        <p><span className="text-muted">Finish </span><span className={cn("num font-semibold", slipDays > 0 && "text-warn")}>{formatDate(p.currentFinish)}</span>{slipDays !== 0 && <span className="num text-muted"> ({slipDays > 0 ? "+" : ""}{slipWeeks} wk)</span>}</p>
        {live && (
          <p className={cn("flex flex-wrap items-center gap-x-1.5", p.missingReport ? "font-semibold text-danger" : "text-muted")}>
            {p.missingReport ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> : <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />}
            {p.lastApprovedDate ? <>Report <span className="num">{formatDate(p.lastApprovedDate)}</span>{p.missingReport ? ` · ${p.daysSinceReport} days ago` : ""}</> : "No approved report yet"}
            {p.pendingReports > 0 && <span className="rounded-md border border-warn/60 px-1.5 text-xs font-semibold text-warn">{p.pendingReports} waiting</span>}
          </p>
        )}
      </div>

      <div className="flex lg:justify-end">{p.health ? <HealthChip score={p.health.score} band={p.health.band} tip={healthTip} /> : <span className="text-sm text-muted">—</span>}</div>
    </li>
  );
}
