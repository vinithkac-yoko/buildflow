import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { changeProjectStatusAction, createStorageAction, updateProjectAction } from "@/actions/projects";
import { AppError } from "@/core/errors";
import { can, canSeeField } from "@/core/auth/permissions";
import { STORAGE_KIND_LABEL, listStorage } from "@/core/planning/storage";
import { getProject } from "@/core/projects/service";
import { PROJECT_STATUS_LABEL, PROJECT_TRANSITIONS } from "@/core/projects/transitions";
import { listAssignments } from "@/core/users/assignments";
import { healthFormula, projectDetailProgress } from "@/core/progress/service";
import { BandChip, DualBar, HealthBreakdown, HealthChip, InfoTip } from "@/components/portfolio/parts";
import { ClientHome } from "@/components/client/client-home";
import { clientPortal } from "@/core/progress/service";
import { SCurve } from "@/components/portfolio/scurve";
import { daysLabel } from "@/lib/format";
import { ActionButton } from "@/components/forms/action-button";
import { ModalForm } from "@/components/forms/modal-form";
import { DemoBadge, ProjectStatusChip } from "@/components/status-chip";
import { NavGlyph } from "@/components/shell/icons";
import { Card } from "@/components/ui/card";
import type { NavIcon } from "@/config/navigation";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL, formatDate, formatInr } from "@/lib/format";
import type { FieldDef } from "@/lib/forms";
import { projectFormFields } from "../project-fields";

/** Milestones already shipped: a locked tile below this line is about the role, not about the build. */
const BUILT_UP_TO = 6;

interface Tile { label: string; icon: NavIcon; milestone: number; href?: (id: string, role: string) => string | null }
const TILES: Tile[] = [
  { label: "Planning", icon: "planning", milestone: 2, href: (id) => `/projects/${id}/planning` },
  { label: "Daily Reports", icon: "dpr", milestone: 3, href: (id, role) => (role === "SITE_ENGINEER" ? `/dpr/${id}` : role === "OWNER" || role === "PROJECT_MANAGER" ? `/progress?project=${id}` : null) },
  { label: "Labour", icon: "labour", milestone: 3, href: (_id, role) => (["OWNER", "PROJECT_MANAGER", "SITE_ENGINEER"].includes(role) ? "/labour" : null) },
  { label: "Materials", icon: "materials", milestone: 4, href: (id) => `/materials?project=${id}` },
  { label: "Procurement", icon: "procurement", milestone: 4, href: (_id, role) => (["OWNER", "PROJECT_MANAGER", "PROCUREMENT"].includes(role) ? "/procurement" : ["SITE_ENGINEER", "STORE_KEEPER"].includes(role) ? (role === "STORE_KEEPER" ? "/receipts" : "/requests") : null) },
  { label: "Quality", icon: "quality", milestone: 5, href: (id, role) => (["OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "QUALITY_ENGINEER"].includes(role) ? `/quality?project=${id}` : null) },
  { label: "Issues", icon: "issues", milestone: 6, href: (id) => `/issues?project=${id}` },
  { label: "Payments", icon: "payments", milestone: 4, href: (_id, role) => (["OWNER", "ACCOUNTS"].includes(role) ? "/payables" : null) },
  { label: "Documents", icon: "documents", milestone: 6, href: (id) => `/documents?project=${id}` },
  { label: "Equipment", icon: "projects", milestone: 6, href: (id, role) => (["OWNER", "PROJECT_MANAGER"].includes(role) ? `/equipment?project=${id}` : null) },
  { label: "Work orders", icon: "billing", milestone: 6, href: (id, role) => (["OWNER", "PROJECT_MANAGER", "ACCOUNTS"].includes(role) ? `/work-orders?project=${id}` : null) },
];

const STORAGE_FIELDS: FieldDef[] = [
  { name: "name", label: "Location name", type: "text", required: true },
  { name: "kind", label: "Type", type: "select", required: true, options: Object.entries(STORAGE_KIND_LABEL).map(([value, label]) => ({ value, label })) },
];

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let p;
  try {
    p = await getProject(ctx, id);
  } catch (e) {
    if (e instanceof AppError) notFound(); // not assigned == not found (don't reveal it exists)
    throw e;
  }

  if (ctx.role === "CLIENT") return <ClientHome v={await clientPortal(ctx, id)} />;

  const canEdit = can(ctx, "update", "project", id);
  const canPlan = can(ctx, "read", "activity", id);
  const showValue = canSeeField(ctx, "contractValue", id);
  const [team, storage] = await Promise.all([
    can(ctx, "read", "assignment") ? listAssignments(ctx, id) : Promise.resolve([]),
    can(ctx, "read", "storage_location", id) ? listStorage(ctx, id) : Promise.resolve([]),
  ]);
  const nextStatuses = canEdit ? PROJECT_TRANSITIONS[p.status] : [];
  const showProgress = can(ctx, "read", "dashboard") && p.status !== "PLANNING";
  const progress = showProgress ? await projectDetailProgress(ctx, id).catch(() => null) : null;

  const facts: [string, string | undefined][] = [
    ["Client", p.client.name],
    ["Location", p.location],
    ["Contract value", p.contractValue !== undefined ? formatInr(p.contractValue) : undefined],
    ["Start date", formatDate(p.baselineStart)],
    ["Target finish", formatDate(p.baselineFinish)],
    ["Current finish", formatDate(p.currentFinish)],
  ];
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/projects" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All projects
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code text-sm text-muted">{p.code}</span>
            <ProjectStatusChip status={p.status} />
            {p.isDemo && <DemoBadge />}
          </div>
          <h1 className="text-2xl md:text-3xl">{p.name}</h1>
        </div>
        {canEdit && (
          <ModalForm
            title="Edit project" label="Edit project" icon="edit" variant="secondary" wide
            fields={projectFormFields({ withValue: showValue })}
            initial={{
              name: p.name, type: p.type, location: p.location, contractValue: p.contractValue ?? "",
              baselineStart: iso(p.baselineStart), baselineFinish: iso(p.baselineFinish), currentFinish: iso(p.currentFinish),
            }}
            action={updateProjectAction.bind(null, id)} successMessage="Project updated."
          />
        )}
      </header>

      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          {facts.filter(([, v]) => v !== undefined).map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="num font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {nextStatuses.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="text-sm text-muted">Change status:</span>
            {nextStatuses.map((s) => (
              <ActionButton
                key={s} label={`Mark ${PROJECT_STATUS_LABEL[s].toLowerCase()}`}
                variant={s === "CANCELLED" ? "danger" : "secondary"}
                confirm={`Change ${p.name} from ${PROJECT_STATUS_LABEL[p.status]} to ${PROJECT_STATUS_LABEL[s]}?`}
                action={changeProjectStatusAction.bind(null, id, s)} successMessage={`Status changed to ${PROJECT_STATUS_LABEL[s]}.`}
              />
            ))}
          </div>
        )}
      </Card>

      {progress && <OpenItems id={id} progress={progress} />}

      {progress && (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="text-lg">Progress</h2>
              <DualBar planned={progress.plannedPct} actual={progress.actualPct} label="Overall progress" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <BandChip band={progress.band} />
                <span className={`num text-sm font-semibold ${progress.daysAheadBehind < 0 ? "text-danger" : "text-brand-text"}`}>{daysLabel(progress.daysAheadBehind)}</span>
              </div>
              <p className="text-sm text-muted">{progress.weightNote}</p>
            </div>
          </div>
          {progress.curve.length > 1 && <SCurve id={`detail-${id}`} data={progress.curve} height={170} />}
          {progress.health && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-[15px] font-semibold">Health</h3>
                <HealthChip score={progress.health.score} band={progress.health.band} tip={healthFormula()} />
                <InfoTip label="How health is scored"><p className="font-semibold">How health is scored (0–100)</p><p className="mt-1">{healthFormula()}</p><p className="mt-1">75 and above is Healthy, 50–74 Watch, below 50 At risk.</p></InfoTip>
              </div>
              <HealthBreakdown h={progress.health} />
            </div>
          )}
          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-[15px] font-semibold">By stage</h3>
            <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
              {progress.wbs.map((w) => (
                <li key={w.code}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{w.name}</span><span className="text-muted">{w.activities} activities</span></div>
                  <DualBar planned={w.plannedPct} actual={w.actualPct} label={w.name} />
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <section aria-labelledby="modules">
        <h2 id="modules" className="mb-3 text-lg">Project modules</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {TILES.map((t) => {
            const target = t.href ? t.href(id, ctx.role) : null;
            const allowed = t.label === "Planning" ? canPlan : t.label === "Materials" ? can(ctx, "read", "inventory", id) : t.label === "Issues" ? can(ctx, "read", "issue", id) : t.label === "Documents" ? can(ctx, "read", "document", id) : true;
            const live = !!target && allowed;
            const body = (
              <>
                <NavGlyph name={t.icon} className="h-6 w-6 text-planned" />
                <div>
                  <div className="font-medium">{t.label}</div>
                  {live ? (
                    <div className="text-xs text-brand-text">Open</div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" aria-hidden /> {t.milestone <= BUILT_UP_TO ? "Not for your role" : `Milestone ${t.milestone}`}</div>
                  )}
                </div>
              </>
            );
            return (
              <li key={t.label}>
                {live ? (
                  <Link href={target!} className="panel flex min-h-24 flex-col justify-between p-4 hover:bg-surface-2">{body}</Link>
                ) : (
                  <div className="panel flex min-h-24 flex-col justify-between p-4 opacity-80" aria-disabled="true">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {can(ctx, "read", "assignment") && (
          <Card>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg">Team</h2>
              {can(ctx, "create", "assignment") && <Link href="/assignments" className="text-sm font-semibold text-brand-text">Manage</Link>}
            </div>
            {team.length === 0 ? <p className="text-muted">Nobody assigned yet.</p> : (
              <ul className="space-y-1.5 text-[15px]">
                {team.map((a) => <li key={a.id}>{a.user.name} <span className="text-muted">· {ROLE_LABEL[a.user.role]}</span></li>)}
              </ul>
            )}
          </Card>
        )}
        {can(ctx, "read", "storage_location", id) && (
          <Card>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg">Storage locations</h2>
              {can(ctx, "create", "storage_location", id) && (
                <ModalForm title="New storage location" label="Add" variant="ghost" fields={STORAGE_FIELDS} action={createStorageAction.bind(null, id)} successMessage="Location added." />
              )}
            </div>
            {storage.length === 0 ? <p className="text-muted">No locations yet. Stock is held per location, so add one before the first receipt.</p> : (
              <ul className="space-y-1.5 text-[15px]">
                {storage.map((s) => <li key={s.id}>{s.name} <span className="text-muted">· {STORAGE_KIND_LABEL[s.kind]}</span></li>)}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

/** What is open on this project right now, each a link to its list. Only non-zero items are shown. */
function OpenItems({ id, progress }: { id: string; progress: Awaited<ReturnType<typeof projectDetailProgress>> }) {
  const lowStock = progress.attention.filter((a) => a.kind === "LOW_STOCK").length;
  type Tone = "danger" | "warn" | "plain";
  const items: { n: number; label: string; href: string; tone: Tone }[] = [
    { n: progress.pendingReports, label: progress.pendingReports === 1 ? "report waiting for approval" : "reports waiting for approval", href: `/progress?status=SUBMITTED&project=${id}`, tone: "warn" as Tone },
    { n: progress.openIssues, label: progress.openIssues === 1 ? "open issue" : "open issues", href: `/issues?project=${id}`, tone: (progress.criticalIssues > 0 ? "danger" : "plain") as Tone },
    { n: progress.openNcrs, label: progress.openNcrs === 1 ? "open NCR" : "open NCRs", href: `/ncr`, tone: (progress.seriousNcrs > 0 ? "danger" : "plain") as Tone },
    { n: progress.ongoingDelays, label: progress.ongoingDelays === 1 ? "ongoing delay" : "ongoing delays", href: `/issues?tab=delays&project=${id}`, tone: "warn" as Tone },
    { n: lowStock, label: lowStock === 1 ? "low-stock material" : "low-stock materials", href: `/materials?project=${id}`, tone: "warn" as Tone },
  ].filter((i) => i.n > 0);
  return (
    <section aria-labelledby="open-items">
      <h2 id="open-items" className="mb-2 text-lg">Open right now</h2>
      {progress.missingReport && <p className="mb-2 flex items-center gap-2 text-[16px] font-semibold text-danger"><span aria-hidden>●</span> No approved daily report for {progress.daysSinceReport ?? "several"} days.</p>}
      {items.length === 0 && !progress.missingReport ? <p className="text-muted">Nothing is open. Reports, issues, NCRs and stock are all in order.</p> : (
        <ul className="flex flex-wrap gap-2">
          {items.map((i) => (
            <li key={i.label}>
              <Link href={i.href} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-3.5 text-[15px] hover:bg-surface-2 ${i.tone === "danger" ? "border-danger/50" : i.tone === "warn" ? "border-warn/50" : "border-border"}`}>
                <span className={`num text-xl font-semibold ${i.tone === "danger" ? "text-danger" : i.tone === "warn" ? "text-warn" : ""}`}>{i.n}</span>{i.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
