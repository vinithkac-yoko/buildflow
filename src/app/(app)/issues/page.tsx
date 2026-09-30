import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CircleAlert, Info, OctagonAlert } from "lucide-react";
import type { IssueSeverity, IssueStatus } from "@prisma/client";
import { updateIssueStatusAction } from "@/actions/dpr";
import { can } from "@/core/auth/permissions";
import { SEVERITY_LABEL } from "@/core/dpr/schemas";
import { ISSUE_STATUS_LABEL, ISSUE_TRANSITIONS, listIssues } from "@/core/issues/service";
import { listProjects } from "@/core/projects/service";
import { ActionButton } from "@/components/forms/action-button";
import { NoAccess } from "@/components/no-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Issues" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const inputCls = "min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-[15px]";
const SEV = { CRITICAL: { icon: OctagonAlert, tone: "danger" as const }, HIGH: { icon: AlertTriangle, tone: "warn" as const }, MEDIUM: { icon: CircleAlert, tone: "plan" as const }, LOW: { icon: Info, tone: "slate" as const } };

export default async function IssuesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "issue")) return <NoAccess />;
  const sp = await searchParams;
  const projectId = one(sp.project);
  const status = (one(sp.status) ?? "ACTIVE") as IssueStatus | "ACTIVE" | "ALL";
  const severity = one(sp.severity) as IssueSeverity | undefined;
  const [projects, issues] = await Promise.all([
    listProjects(ctx),
    listIssues(ctx, { projectId, status: status === "ALL" ? undefined : status, severity }),
  ]);
  const canUpdate = can(ctx, "update", "issue");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Issues</h1>
        <p className="text-muted">{ctx.role === "SITE_ENGINEER" ? "Problems raised on your sites. Report a new one from your daily report." : "Problems raised from the sites, most serious first."}</p>
      </div>
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">Status
            <select name="status" defaultValue={status} className={inputCls}>
              <option value="ACTIVE">Open and in progress</option><option value="ALL">All</option>
              {(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((s) => <option key={s} value={s}>{ISSUE_STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="block text-sm">Project
            <select name="project" defaultValue={projectId ?? ""} className={inputCls}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select>
          </label>
          <label className="block text-sm">Severity
            <select name="severity" defaultValue={severity ?? ""} className={inputCls}><option value="">Any</option>{(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}</select>
          </label>
          <div className="flex items-end"><Button type="submit" className="w-full">Apply filters</Button></div>
        </form>
      </Card>

      {issues.length === 0 ? (
        <Card><p className="font-medium">No issues match.</p><p className="text-muted">That is good news, or widen the filters.</p></Card>
      ) : (
        <ul className="space-y-3">
          {issues.map((i) => {
            const s = SEV[i.severity];
            const Icon = s.icon;
            return (
              <li key={i.id} className="panel space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Badge tone={s.tone}><Icon className="h-3.5 w-3.5" aria-hidden />{SEVERITY_LABEL[i.severity]}</Badge><span className="code text-sm text-muted">{i.code}</span></div>
                  <Badge tone={i.status === "RESOLVED" || i.status === "CLOSED" ? "ok" : "slate"}>{ISSUE_STATUS_LABEL[i.status]}</Badge>
                </div>
                <h2 className="text-[18px] leading-snug">{i.title}</h2>
                <p className="text-[15px] text-muted">{i.projectCode} · {i.projectName}{i.activity ? ` · ${i.activity}` : ""}</p>
                <p className="text-sm text-muted">Reported by {i.reportedBy} on {formatDate(i.createdAt)}{i.target ? ` · target ${formatDate(i.target)}` : ""}</p>
                {canUpdate && ISSUE_TRANSITIONS[i.status].length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {ISSUE_TRANSITIONS[i.status].map((to) => (
                      <ActionButton key={to} label={to === "IN_PROGRESS" ? "Start work" : to === "RESOLVED" ? "Mark resolved" : to === "CLOSED" ? "Close" : "Reopen"}
                        action={updateIssueStatusAction.bind(null, i.id, to)} successMessage={`Now ${ISSUE_STATUS_LABEL[to].toLowerCase()}.`} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
