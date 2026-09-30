"use client";

import { useState } from "react";
import { addIssueAction } from "@/actions/dpr";
import { endDelayAction, recordDelayAction, setIssueTargetAction } from "@/actions/ops";
import { FormModal, areaCls, numOrUndef, selectCls, today } from "@/components/forms/form-modal";
import { Input, Label } from "@/components/ui/input";

export interface ProjectActs { id: string; code: string; name: string; activities: { id: string; name: string }[] }
interface Opt { value: string; label: string }

/** Report an issue against a project (and optionally an activity), with a target date. */
export function IssueReportButton({ projects, severities }: { projects: ProjectActs[]; severities: Opt[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [activityId, setActivityId] = useState("");
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [target, setTarget] = useState("");
  const [description, setDescription] = useState("");
  const project = projects.find((p) => p.id === projectId);
  const reset = () => { setTitle(""); setActivityId(""); setTarget(""); setDescription(""); setSeverity("MEDIUM"); };
  return (
    <FormModal title="Report an issue" label="Report an issue" submitLabel="Report issue" successMessage="Issue reported."
      onSubmit={async () => { const r = await addIssueAction(projectId, { title, severity, activityId: activityId || null, description: description || null, targetResolutionDate: target || null }); if (r.ok) reset(); return r; }}>
      {({ err }) => (
        <>
          {projects.length > 1 && (
            <div><Label htmlFor="is-project">Project</Label>
              <select id="is-project" className={selectCls} value={projectId} onChange={(e) => { setProjectId(e.target.value); setActivityId(""); }}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </select></div>
          )}
          <div><Label htmlFor="is-title">What is the problem? <span className="text-danger">*</span></Label><Input id="is-title" value={title} onChange={(e) => setTitle(e.target.value)} />{err("title")}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="is-sev">How serious?</Label>
              <select id="is-sev" className={selectCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>{severities.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>{err("severity")}</div>
            <div><Label htmlFor="is-target">Fix by (optional)</Label><Input id="is-target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} />{err("targetResolutionDate")}</div>
          </div>
          <div><Label htmlFor="is-act">Activity (optional)</Label>
            <select id="is-act" className={selectCls} value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              <option value="">Not tied to one activity</option>{project?.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <div><Label htmlFor="is-desc">Details (optional)</Label><textarea id="is-desc" rows={3} className={areaCls} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />{err("description")}</div>
        </>
      )}
    </FormModal>
  );
}

export function IssueTargetButton({ issueId, current }: { issueId: string; current: string | null }) {
  const [date, setDate] = useState(current ?? "");
  return (
    <FormModal title="Target date" label={current ? "Change target date" : "Set target date"} icon="none" variant="secondary" submitLabel="Save date" successMessage="Target date saved."
      onSubmit={() => setIssueTargetAction(issueId, date || null)}>
      {({ err }) => <div><Label htmlFor="it-date">Resolve by</Label><Input id="it-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />{err("_")}</div>}
    </FormModal>
  );
}

/** Record a delay: the cause and evidence, against a function — never a person. */
export function DelayRecordButton({ projects, categories, functions }: { projects: ProjectActs[]; categories: Opt[]; functions: Opt[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [f, setF] = useState({ category: "", delayFactor: "", activityId: "", startDate: today(), endDate: "", critical: false, cost: "", evidence: "", impact: "", fn: "", action: "" });
  const set = (k: keyof typeof f, v: string | boolean) => setF((c) => ({ ...c, [k]: v }));
  const project = projects.find((p) => p.id === projectId);
  return (
    <FormModal title="Record a delay" label="Record a delay" submitLabel="Save delay" successMessage="Delay recorded." wide
      onSubmit={() => recordDelayAction(projectId, {
        category: f.category || undefined, delayFactor: f.delayFactor, activityId: f.activityId || null, startDate: f.startDate, endDate: f.endDate || null,
        criticalPathImpact: f.critical, costImpact: numOrUndef(f.cost) ?? null, evidence: f.evidence, impact: f.impact || null, responsibleFunction: f.fn || undefined, correctiveAction: f.action || null,
      })}>
      {({ err }) => (
        <>
          <p className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-[15px]">A delay records what happened and which <strong>function</strong> can fix it — never a person to blame.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.length > 1 && (
              <div><Label htmlFor="dl-project">Project</Label>
                <select id="dl-project" className={selectCls} value={projectId} onChange={(e) => { setProjectId(e.target.value); set("activityId", ""); }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></div>
            )}
            <div><Label htmlFor="dl-cat">Category <span className="text-danger">*</span></Label>
              <select id="dl-cat" className={selectCls} value={f.category} onChange={(e) => set("category", e.target.value)}><option value="">Select…</option>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>{err("category")}</div>
          </div>
          <div><Label htmlFor="dl-factor">What caused it? <span className="text-danger">*</span></Label><Input id="dl-factor" value={f.delayFactor} onChange={(e) => set("delayFactor", e.target.value)} />{err("delayFactor")}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="dl-start">Started <span className="text-danger">*</span></Label><Input id="dl-start" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />{err("startDate")}</div>
            <div><Label htmlFor="dl-end">Ended (empty if still going)</Label><Input id="dl-end" type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />{err("endDate")}</div>
          </div>
          <div><Label htmlFor="dl-act">Activity affected (optional)</Label>
            <select id="dl-act" className={selectCls} value={f.activityId} onChange={(e) => set("activityId", e.target.value)}><option value="">Not tied to one activity</option>{project?.activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{err("activityId")}</div>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[17px]"><input type="checkbox" checked={f.critical} onChange={(e) => set("critical", e.target.checked)} className="h-6 w-6 accent-[rgb(var(--brand))]" />It affects the critical path</label>
          <div><Label htmlFor="dl-evid">Evidence <span className="text-danger">*</span></Label><textarea id="dl-evid" rows={2} className={areaCls} value={f.evidence} onChange={(e) => set("evidence", e.target.value)} placeholder="Photos, messages, delivery notes, weather report…" />{err("evidence")}</div>
          <div><Label htmlFor="dl-impact">Impact</Label><Input id="dl-impact" value={f.impact} onChange={(e) => set("impact", e.target.value)} placeholder="What it pushed back or stopped" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="dl-fn">Responsible function <span className="text-danger">*</span></Label>
              <select id="dl-fn" className={selectCls} value={f.fn} onChange={(e) => set("fn", e.target.value)}><option value="">Select…</option>{functions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>{err("responsibleFunction")}</div>
            <div><Label htmlFor="dl-cost">Cost impact (₹, optional)</Label><Input id="dl-cost" inputMode="decimal" value={f.cost} onChange={(e) => set("cost", e.target.value)} />{err("costImpact")}</div>
          </div>
          <div><Label htmlFor="dl-action">Corrective action</Label><Input id="dl-action" value={f.action} onChange={(e) => set("action", e.target.value)} placeholder="What will stop it happening again" /></div>
        </>
      )}
    </FormModal>
  );
}

export function DelayEndButton({ delayId }: { delayId: string }) {
  const [date, setDate] = useState(today());
  return (
    <FormModal title="End this delay" label="Mark ended" icon="none" variant="secondary" submitLabel="Save end date" successMessage="Delay ended."
      onSubmit={() => endDelayAction(delayId, date)}>
      {({ err }) => <div><Label htmlFor="de-date">Last day of the delay</Label><Input id="de-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />{err("endDate")}</div>}
    </FormModal>
  );
}
