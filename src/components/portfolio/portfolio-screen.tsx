import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronDown, ClipboardList, Flame, PackageMinus, PauseCircle, ShieldAlert } from "lucide-react";
import { portfolioCurves, portfolioProgress, healthFormula, type AttentionItem, type ProjectProgress } from "@/core/progress/service";
import { DemoBadge, ProjectStatusChip } from "@/components/status-chip";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { daysLabel, formatDate, formatInr, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";
import { BandChip, DualBar, HealthRing, InfoTip, rank } from "./parts";
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

  const active = data.projects.filter((p) => p.status === "ACTIVE" || p.status === "DELAYED");
  const group = (bands: string[]) => active.filter((p) => bands.includes(p.band)).length;
  const kpis = [
    { label: "On track or ahead", n: group(["ON_TRACK", "AHEAD"]), tone: "text-brand-text" },
    { label: "Slightly behind", n: group(["SLIGHTLY_BEHIND"]), tone: "text-warn" },
    { label: "Behind", n: group(["BEHIND"]), tone: "text-danger" },
    { label: "Reports waiting", n: data.projects.reduce((s, p) => s + p.pendingReports, 0), tone: "text-planned" },
  ];
  const totalValue = data.projects.some((p) => p.contractValue !== undefined) ? data.projects.reduce((s, p) => s + Number(p.contractValue ?? 0), 0) : null;
  const attention = data.attention.filter((a) => !pmFilter || scoped.some((p) => p.projectId === a.projectId));

  const tip = healthFormula();
  const methodTip = (
    <>
      <p className="font-semibold">How progress is measured</p>
      <p className="mt-1"><b>Actual %</b> = each activity&apos;s approved quantity ÷ planned quantity, weighted by planned cost (or planned mandays when cost isn&apos;t available).</p>
      <p className="mt-1"><b>Plan %</b> = where the plan says the work should be today, interpolated between each activity&apos;s planned start and finish.</p>
      <p className="mt-1"><b>Days ahead/behind</b> = when the plan reached today&apos;s actual %, compared with today.</p>
    </>
  );

  const sorted = [...scoped].sort((a, b) => rank(a) - rank(b));
  const groups = view === "pm"
    ? [...new Map(sorted.map((p) => [p.pmId ?? "none", { name: p.pmName ?? "No PM assigned", items: [] as ProjectProgress[] }])).entries()].map(([k, g]) => ({ key: k, name: g.name, items: sorted.filter((p) => (p.pmId ?? "none") === k) }))
    : [{ key: "all", name: "", items: sorted }];

  const linkTo = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { status: one(searchParams.status), pm: pmFilter, view: one(searchParams.view), ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Freshness strip: the replacement for chasing updates on WhatsApp */}
      <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
        <h1 className="text-2xl md:text-3xl">Portfolio progress</h1>
        <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
          <span aria-hidden className="h-2.5 w-2.5 animate-pulse-dot rounded-full bg-brand" />
          {data.freshness.approvedToday > 0
            ? <>Updated from <span className="num font-semibold">{data.freshness.approvedToday}</span> approved report{data.freshness.approvedToday === 1 ? "" : "s"} today · last update <span className="num font-semibold">{data.freshness.lastUpdate ? formatTime(data.freshness.lastUpdate) : "—"}</span></>
            : <>No reports approved yet today</>}
        </p>
      </div>

      {/* KPI tiles */}
      <section aria-label="Portfolio summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k, i) => (
          <Card key={k.label} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="text-sm text-muted">{k.label}</div>
            <div className={cn("num mt-1 text-5xl font-light leading-none", k.tone)}><CountUp value={k.n} /></div>
          </Card>
        ))}
      </section>
      {totalValue !== null && <p className="-mt-3 text-sm text-muted">{active.length} live sites · contract value across all projects <span className="num font-semibold text-text">{formatInr(totalValue)}</span></p>}

      {/* Needs attention: exceptions first */}
      <section aria-labelledby="attention" className="space-y-2">
        <div className="flex items-center gap-2"><h2 id="attention" className="text-lg">Needs attention</h2><span className="num rounded-full border border-border px-2 text-sm">{attention.length}</span></div>
        {attention.length === 0 ? (
          <Card><p className="font-medium">Nothing needs attention right now.</p><p className="text-muted">Behind-schedule activities, missing or waiting reports, serious issues and low stock will show up here.</p></Card>
        ) : (
          <>
            <ul className="grid gap-2 md:grid-cols-2">{attention.slice(0, 8).map((a, i) => <AttentionRow key={`${a.kind}-${a.projectId}-${i}`} a={a} />)}</ul>
            {attention.length > 8 && (
              <details className="group">
                <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-[15px] font-semibold text-brand-text"><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden /> Show {attention.length - 8} more</summary>
                <ul className="mt-2 grid gap-2 md:grid-cols-2">{attention.slice(8).map((a, i) => <AttentionRow key={`m-${a.kind}-${a.projectId}-${i}`} a={a} />)}</ul>
              </details>
            )}
          </>
        )}
      </section>

      {/* Filters and view */}
      <section aria-label="Projects" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><h2 className="text-lg">Projects</h2><InfoTip label="How progress is calculated">{methodTip}</InfoTip></div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Status filter" className="flex gap-1">
              {STATUS_FILTERS.map((f) => (
                <Link key={f.key} href={linkTo({ status: f.key === "active" ? undefined : f.key })} aria-current={status === f.key ? "page" : undefined}
                  className={cn("flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold", status === f.key ? "border-brand bg-brand text-brand-on" : "border-border hover:bg-surface-2")}>{f.label}</Link>
              ))}
            </nav>
            {user.role === "OWNER" && pms.length > 1 && (
              <form method="get" className="flex items-center gap-1">
                {status !== "active" && <input type="hidden" name="status" value={status} />}
                {one(searchParams.view) && <input type="hidden" name="view" value={one(searchParams.view)} />}
                <label className="sr-only" htmlFor="pm">Project manager</label>
                <select id="pm" name="pm" defaultValue={pmFilter ?? ""} className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm">
                  <option value="">All PMs</option>{pms.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
                <button type="submit" className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-2 cursor-pointer">Filter</button>
              </form>
            )}
            {user.role === "OWNER" && (
              <nav aria-label="View" className="flex gap-1">
                <Link href={linkTo({ view: undefined })} aria-current={view === "pm" ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold", view === "pm" ? "border-planned text-planned" : "border-border hover:bg-surface-2")}>By PM</Link>
                <Link href={linkTo({ view: "flat" })} aria-current={view === "flat" ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold", view === "flat" ? "border-planned text-planned" : "border-border hover:bg-surface-2")}>Worst first</Link>
              </nav>
            )}
          </div>
        </div>

        {scoped.length === 0 ? (
          <Card><p className="font-medium">No projects match these filters.</p><p className="text-muted">Try “All” to see every project.</p></Card>
        ) : (
          groups.map((g) => {
            const live = g.items.filter((p) => p.status === "ACTIVE" || p.status === "DELAYED");
            const on = live.filter((p) => p.band === "ON_TRACK" || p.band === "AHEAD").length;
            const slight = live.filter((p) => p.band === "SLIGHTLY_BEHIND").length;
            const behind = live.filter((p) => p.band === "BEHIND").length;
            const list = (
              <ul className="space-y-3">{g.items.map((p, i) => <ProjectRow key={p.projectId} p={p} curve={curves.get(p.projectId)} index={i} tip={tip} />)}</ul>
            );
            return view === "pm" ? (
              <details key={g.key} open className="group space-y-3">
                <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-4 py-2">
                  <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                  <span className="text-[17px] font-semibold">{g.name}</span>
                  <span className="num text-sm text-muted">{g.items.length} sites{live.length > 0 ? <> · <span className="text-brand-text">{on} on track</span>{slight > 0 && <> · <span className="text-warn">{slight} slightly behind</span></>}{behind > 0 && <> · <span className="text-danger">{behind} behind</span></>}</> : null}</span>
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

function AttentionRow({ a }: { a: AttentionItem }) {
  const Icon = KIND_ICON[a.kind];
  return (
    <li>
      <Link href={a.href} className="panel flex min-h-16 items-start gap-3 p-3 hover:bg-surface-2">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", a.priority === 1 ? "text-danger" : "text-warn")} aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="code text-muted">{a.projectCode}</span>
            <span className={cn("font-semibold uppercase tracking-wide", a.priority === 1 ? "text-danger" : "text-warn")}>{a.priority === 1 ? "Act now" : "Soon"}</span>
            <span className="text-muted">{KIND_LABEL[a.kind]}</span>
          </div>
          <div className="text-[15px] font-medium leading-snug">{a.title}</div>
          <div className="text-sm text-muted">{a.detail}</div>
        </div>
      </Link>
    </li>
  );
}

function ProjectRow({ p, curve, index, tip }: { p: ProjectProgress; curve?: { date: string; planned: number; actual: number }[]; index: number; tip: string }) {
  const live = p.status === "ACTIVE" || p.status === "DELAYED";
  const slipDays = Math.round((new Date(p.currentFinish).getTime() - new Date(p.baselineFinish).getTime()) / 86_400_000);
  return (
    <li className="animate-fade-up" style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}>
      <article className="panel grid gap-4 p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_auto] md:items-center md:p-5" aria-label={p.name}>
        {/* identity */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code text-sm text-muted">{p.code}</span>
            {p.isDemo && <DemoBadge />}
            {!live && <ProjectStatusChip status={p.status} />}
          </div>
          <Link href={`/projects/${p.projectId}`} className="mt-0.5 block text-[18px] font-semibold leading-snug hover:underline">{p.name}</Link>
          <p className="text-sm text-muted">{p.clientName}{p.contractValue !== undefined ? <> · <span className="num font-semibold text-text">{formatInr(p.contractValue)}</span></> : null}</p>
          {p.pmName && <p className="text-sm text-muted">PM {p.pmName}{p.engineerName ? ` · Eng. ${p.engineerName}` : ""}</p>}
        </div>

        {/* progress */}
        <div className="space-y-2">
          {live || p.actualPct > 0 ? (
            <>
              <DualBar planned={p.plannedPct} actual={p.actualPct} label={p.name} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <BandChip band={p.band} />
                {live && <span className={cn("num text-sm font-semibold", p.daysAheadBehind < 0 ? "text-danger" : "text-brand-text")}>{daysLabel(p.daysAheadBehind)}</span>}
              </div>
            </>
          ) : <p className="inline-flex items-center gap-2 text-sm text-muted"><PauseCircle className="h-4 w-4" aria-hidden /> {p.status === "PLANNING" ? "In planning — no site progress yet." : "No progress recorded."}</p>}
        </div>

        {/* curve + dates */}
        <div className="space-y-2">
          {curve && curve.length > 1 && <SCurve id={p.projectId} data={curve} />}
          <dl className="grid grid-cols-2 gap-x-3 text-sm">
            <div><dt className="text-muted">Baseline finish</dt><dd className="num font-semibold">{formatDate(p.baselineFinish)}</dd></div>
            <div><dt className="text-muted">Now</dt><dd className={cn("num font-semibold", slipDays > 0 ? "text-warn" : "")}>{formatDate(p.currentFinish)}{slipDays !== 0 ? ` (${slipDays > 0 ? "+" : ""}${Math.round(slipDays / 7)} wk)` : ""}</dd></div>
          </dl>
          {live && (
            <p className={cn("flex items-center gap-1.5 text-sm", p.missingReport ? "font-semibold text-danger" : "text-muted")}>
              {p.missingReport ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> : <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />}
              {p.lastApprovedDate ? <>Last approved report <span className="num">{formatDate(p.lastApprovedDate)}</span>{p.missingReport ? ` — ${p.daysSinceReport} days ago` : ""}</> : "No approved report yet"}
              {p.pendingReports > 0 && <span className="ml-1 rounded-md border border-warn/60 px-1.5 text-xs font-semibold text-warn">{p.pendingReports} waiting</span>}
            </p>
          )}
        </div>

        {/* health */}
        <div className="flex md:justify-end">{p.health ? <HealthRing score={p.health.score} band={p.health.band} tip={tip} /> : <span className="text-sm text-muted">—</span>}</div>
      </article>
    </li>
  );
}
