"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { completeInspectionAction, requestInspectionAction } from "@/actions/quality";
import { ChipGroup, PickerSheet, SectionHeader } from "@/components/dpr/ui";
import { RESULT_LABEL, inspectionResult } from "@/core/quality/calc";
import type { InspectionFormData } from "@/core/quality/inspections";
import { SEVERITIES, SEVERITY_LABEL } from "@/core/quality/schemas";
import { callOrQueue } from "@/lib/offline/queue-call";
import { cn } from "@/lib/utils";

const newTxn = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

function Picker({ label, value, placeholder, onClick, disabled }: { label: string; value: string | null; placeholder: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-border bg-bg px-4 text-left text-[17px] font-medium disabled:opacity-50 cursor-pointer">
      <span className={value ? "" : "text-muted"}>{value ?? placeholder}</span>
    </button>
  );
}

function Slab({ children, disabled, pending, onClick }: { children: React.ReactNode; disabled?: boolean; pending?: boolean; onClick: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-bg/95 px-4 pb-2 pt-2 backdrop-blur md:bottom-0 md:left-[248px]">
      <div className="mx-auto max-w-xl">
        <button type="button" onClick={onClick} disabled={disabled || pending}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[18px] font-bold text-brand-on hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
          {pending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
          {children}
        </button>
      </div>
    </div>
  );
}

/** Site Engineer: ask for an inspection of an activity. */
export function InspectionRequestForm({ data }: { data: InspectionFormData }) {
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? "");
  const project = data.projects.find((p) => p.id === projectId) ?? data.projects[0];
  const [activityId, setActivityId] = useState<string | null>(null);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sheet, setSheet] = useState<null | "activity" | "checklist">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "sent" | "queued">(null);
  const [pending, start] = useTransition();
  const txn = useRef(newTxn());
  if (!project) return <p className="text-muted">You are not assigned to an active project.</p>;

  const send = () => {
    setError(null);
    start(async () => {
      const body = { activityId, checklistId, note: note.trim() || null };
      const out = await callOrQueue(
        { type: "inspection.request", projectId: project.id, clientTxnId: txn.current, payload: body, label: `Inspection request — ${project.code}` },
        () => requestInspectionAction(project.id, { ...body, clientTxnId: txn.current }),
      );
      try { navigator.vibrate?.(10); } catch { /* unsupported */ }
      if (out.queued) return setDone("queued");
      if (out.result.ok) setDone("sent");
      else setError(out.result.error);
    });
  };

  if (done) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center gap-5 px-4 text-center" role="status">
        <h1 className="text-3xl">{done === "queued" ? "Request saved on your phone" : "Inspection requested"}</h1>
        <p className="text-[18px]">{done === "queued" ? "You're offline. It will go to the Quality Engineer automatically when you're back online." : "The Quality Engineer will see it on their list."}</p>
        <Link href="/quality" className="flex min-h-16 w-full max-w-sm items-center justify-center rounded-xl bg-brand text-[18px] font-bold text-brand-on hover:brightness-110">Back to Quality</Link>
      </div>
    );
  }
  const actLabel = project.activities.find((a) => a.id === activityId)?.name ?? null;
  const listLabel = data.checklists.find((c) => c.id === checklistId)?.name ?? null;
  return (
    <div className="mx-auto max-w-xl pb-40">
      <h1 className="text-2xl md:text-3xl">Request an inspection</h1>
      <p className="mb-3 text-muted">Ask the Quality Engineer to check finished or ready work.</p>
      {data.projects.length > 1 && (
        <div className="mb-3"><ChipGroup label="Project" value={projectId} columns={Math.min(data.projects.length, 3)} options={data.projects.map((p) => ({ value: p.id, label: p.code }))} onChange={(v) => { setProjectId(v); setActivityId(null); }} /></div>
      )}
      <p className="mb-3 text-[15px]"><span className="code text-muted">{project.code}</span> <span className="font-semibold">{project.name}</span></p>
      <div className="space-y-3">
        <Picker label="Activity" value={actLabel} placeholder="Which work? Pick an activity…" onClick={() => setSheet("activity")} />
        <Picker label="Checklist" value={listLabel} placeholder="Which checklist? Pick one…" onClick={() => setSheet("checklist")} />
        <textarea aria-label="Note for the inspector" value={note} maxLength={300} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Anything the inspector should know (optional)"
          className="min-h-20 w-full rounded-xl border-2 border-border bg-bg p-3 text-[17px] placeholder:text-muted/70" />
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-danger/50 p-3 text-[16px] text-danger">{error}</p>}
      <Slab onClick={send} pending={pending} disabled={!activityId || !checklistId}>{pending ? "Sending…" : "REQUEST INSPECTION"}</Slab>
      <PickerSheet open={sheet === "activity"} onClose={() => setSheet(null)} title="Activity" selected={activityId}
        groups={[{ label: "Activities", options: project.activities.map((a) => ({ value: a.id, label: a.name })) }]} onPick={(v) => { setActivityId(v); setSheet(null); }} />
      <PickerSheet open={sheet === "checklist"} onClose={() => setSheet(null)} title="Checklist" selected={checklistId}
        groups={[{ label: "Checklists", options: data.checklists.map((c) => ({ value: c.id, label: c.name, hint: `${c.items.length} checkpoints` })) }]} onPick={(v) => { setChecklistId(v); setSheet(null); }} />
    </div>
  );
}

export interface InspectionPreset { requestId?: string; projectId?: string; activityId?: string; checklistId?: string; requestNote?: string | null; requestedBy?: string | null }

/** Quality Engineer: answer every checkpoint; the result is computed live and a rejection raises an NCR. */
export function InspectionForm({ data, preset }: { data: InspectionFormData; preset: InspectionPreset }) {
  const [projectId, setProjectId] = useState(preset.projectId ?? data.projects[0]?.id ?? "");
  const project = data.projects.find((p) => p.id === projectId) ?? data.projects[0];
  const [activityId, setActivityId] = useState<string | null>(preset.activityId ?? null);
  const [checklistId, setChecklistId] = useState<string | null>(preset.checklistId ?? null);
  const [answers, setAnswers] = useState<Record<number, boolean | undefined>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("MAJOR");
  const [defect, setDefect] = useState("");
  const [subcontractorId, setSubcontractorId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "activity" | "checklist" | "sub">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { inspectionId: string; result: keyof typeof RESULT_LABEL; ncrId: string | null }>(null);
  const [pending, start] = useTransition();
  const txn = useRef(newTxn());

  const checklist = data.checklists.find((c) => c.id === checklistId) ?? null;
  const locked = !!preset.requestId; // a request fixes the activity and checklist
  const answered = checklist ? checklist.items.filter((i) => answers[i.seq] !== undefined).length : 0;
  const passed = checklist ? checklist.items.filter((i) => answers[i.seq] === true).length : 0;
  const complete = !!checklist && answered === checklist.items.length;
  const live = useMemo(() => (complete && checklist ? inspectionResult(checklist.items.length, passed) : null), [complete, checklist, passed]);
  if (!project) return <p className="text-muted">No active project to inspect.</p>;

  const setAll = (v: boolean) => checklist && setAnswers(Object.fromEntries(checklist.items.map((i) => [i.seq, v])));

  const submit = () => {
    setError(null);
    if (!checklist) return;
    start(async () => {
      const res = await completeInspectionAction(project.id, {
        requestId: preset.requestId ?? null, activityId, checklistId,
        results: checklist.items.map((i) => ({ seq: i.seq, passed: answers[i.seq] === true, note: notes[i.seq]?.trim() || null })),
        remarks: remarks.trim() || null, subcontractorId, severity: live === "REJECTED_NCR" ? severity : null, defect: live === "REJECTED_NCR" ? defect.trim() || null : null,
        clientTxnId: txn.current,
      });
      if (res.ok && res.data) { try { navigator.vibrate?.(10); } catch { /* unsupported */ } setDone(res.data as typeof done); } else if (!res.ok) setError(res.error);
    });
  };

  if (done) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center" role="status">
        <h1 className="text-3xl">{RESULT_LABEL[done.result]}</h1>
        <p className="text-[18px]">{passed} of {checklist?.items.length} checkpoints passed.</p>
        {done.ncrId && <Link href={`/ncr/${done.ncrId}`} className="flex min-h-16 w-full max-w-sm items-center justify-center rounded-xl bg-brand text-[18px] font-bold text-brand-on hover:brightness-110">Open the NCR</Link>}
        <Link href={`/inspections/${done.inspectionId}`} className="flex min-h-14 w-full max-w-sm items-center justify-center rounded-xl border-2 border-border text-[17px] font-semibold hover:bg-surface-2">See the inspection</Link>
        <Link href="/inspections" className="text-[16px] underline">Back to inspections</Link>
      </div>
    );
  }

  const actLabel = project.activities.find((a) => a.id === activityId)?.name ?? null;
  const subLabel = data.subcontractors.find((s) => s.id === subcontractorId)?.name ?? null;
  return (
    <div className="mx-auto max-w-xl pb-44">
      <h1 className="text-2xl md:text-3xl">Inspection</h1>
      {preset.requestId && <p className="mb-2 text-muted">Requested{preset.requestedBy ? ` by ${preset.requestedBy}` : ""}{preset.requestNote ? ` — “${preset.requestNote}”` : ""}</p>}
      {data.projects.length > 1 && !locked && (
        <div className="my-3"><ChipGroup label="Project" value={projectId} columns={Math.min(data.projects.length, 3)} options={data.projects.map((p) => ({ value: p.id, label: p.code }))} onChange={(v) => { setProjectId(v); setActivityId(null); }} /></div>
      )}
      <p className="mb-3 text-[15px]"><span className="code text-muted">{project.code}</span> <span className="font-semibold">{project.name}</span></p>
      <div className="space-y-3">
        <Picker label="Activity" value={actLabel} placeholder="Which work is being inspected?" disabled={locked} onClick={() => setSheet("activity")} />
        <Picker label="Checklist" value={checklist?.name ?? null} placeholder="Pick the checklist…" disabled={locked} onClick={() => setSheet("checklist")} />
      </div>

      {checklist && activityId && (
        <section aria-labelledby="checkpoints" className="mt-5">
          <SectionHeader id="checkpoints" title="Checkpoints" hint={`${answered} of ${checklist.items.length} answered`}
            right={<button type="button" onClick={() => setAll(true)} className="min-h-12 rounded-xl px-3 text-[15px] font-semibold text-brand-text cursor-pointer">All pass</button>} />
          <ol className="mt-3 space-y-3">
            {checklist.items.map((i) => {
              const a = answers[i.seq];
              return (
                <li key={i.seq} className="panel p-3">
                  <p className="mb-2 text-[17px] font-medium leading-snug"><span className="num text-muted">{i.seq}.</span> {i.text}</p>
                  <div role="radiogroup" aria-label={`Checkpoint ${i.seq}: ${i.text}`} className="grid grid-cols-2 gap-2">
                    {([true, false] as const).map((v) => (
                      <button key={String(v)} type="button" role="radio" aria-checked={a === v} aria-label={`${v ? "Pass" : "Fail"} — ${i.text}`} onClick={() => setAnswers((cur) => ({ ...cur, [i.seq]: v }))}
                        className={cn("flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 text-[17px] font-semibold cursor-pointer",
                          a === v ? (v ? "border-brand bg-brand text-brand-on" : "border-danger bg-danger text-white") : "border-border bg-bg hover:bg-surface-2")}>
                        {a === v && (v ? <Check className="h-5 w-5" aria-hidden /> : <X className="h-5 w-5" aria-hidden />)}
                        {v ? "Pass" : "Fail"}
                      </button>
                    ))}
                  </div>
                  {a === false && (
                    <input aria-label={`Note for checkpoint ${i.seq}`} value={notes[i.seq] ?? ""} maxLength={300} onChange={(e) => setNotes((n) => ({ ...n, [i.seq]: e.target.value }))} placeholder="What is wrong? (optional)"
                      className="mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-bg px-3 text-[16px] placeholder:text-muted/70" />
                  )}
                </li>
              );
            })}
          </ol>

          <div className="panel mt-4 p-4" aria-live="polite">
            <p className="text-sm text-muted">Result so far</p>
            <p className="num text-[22px] font-semibold">{passed} of {checklist.items.length} pass{live ? ` — ${RESULT_LABEL[live]}` : ""}</p>
            {!live && <p className="text-sm text-muted">Answer every checkpoint to see the result.</p>}
            {live === "CONDITIONAL_PASS" && <p className="text-sm text-muted">Most checkpoints passed. Note what still needs fixing in the remarks.</p>}
          </div>

          {live === "REJECTED_NCR" && (
            <div className="panel mt-3 space-y-3 border-danger/60 p-4">
              <p className="text-[16px] font-semibold text-danger">This will raise a Non-Conformance Report.</p>
              <div>
                <p className="mb-1 text-[15px] font-medium">How serious?</p>
                <ChipGroup label="Severity" value={severity} columns={3} size="md" options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} onChange={setSeverity} />
              </div>
              <textarea aria-label="Describe the defect" value={defect} maxLength={500} rows={3} onChange={(e) => setDefect(e.target.value)} placeholder="Describe the defect (optional — the failed checkpoints are listed for you)"
                className="w-full rounded-xl border-2 border-border bg-bg p-3 text-[16px] placeholder:text-muted/70" />
              <Picker label="Subcontractor" value={subLabel} placeholder="Subcontractor at fault (default: last one on this work)" onClick={() => setSheet("sub")} />
            </div>
          )}
          <textarea aria-label="Remarks" value={remarks} maxLength={1000} rows={3} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (optional)"
            className="mt-3 w-full rounded-xl border-2 border-border bg-bg p-3 text-[16px] placeholder:text-muted/70" />
        </section>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl border border-danger/50 p-3 text-[16px] text-danger">{error}</p>}
      <Slab onClick={submit} pending={pending} disabled={!complete || !activityId}>{pending ? "Saving…" : "COMPLETE INSPECTION"}</Slab>

      <PickerSheet open={sheet === "activity"} onClose={() => setSheet(null)} title="Activity" selected={activityId}
        groups={[{ label: "Activities", options: project.activities.map((a) => ({ value: a.id, label: a.name })) }]} onPick={(v) => { setActivityId(v); setSheet(null); }} />
      <PickerSheet open={sheet === "checklist"} onClose={() => setSheet(null)} title="Checklist" selected={checklistId}
        groups={[{ label: "Checklists", options: data.checklists.map((c) => ({ value: c.id, label: c.name, hint: `${c.items.length} checkpoints` })) }]} onPick={(v) => { setChecklistId(v); setAnswers({}); setNotes({}); setSheet(null); }} />
      <PickerSheet open={sheet === "sub"} onClose={() => setSheet(null)} title="Subcontractor" selected={subcontractorId ?? ""}
        groups={[{ label: "Subcontractors", options: [{ value: "", label: "Use the last subcontractor on this work" }, ...data.subcontractors.map((s) => ({ value: s.id, label: s.name }))] }]} onPick={(v) => { setSubcontractorId(v || null); setSheet(null); }} />
    </div>
  );
}
