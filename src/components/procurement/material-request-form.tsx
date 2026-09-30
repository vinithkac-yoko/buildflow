"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createMaterialRequestAction } from "@/actions/procurement";
import { ChipGroup, PickerSheet, QtyInput, SectionHeader } from "@/components/dpr/ui";
import { callOrQueue } from "@/lib/offline/queue-call";

export interface MrProject {
  id: string;
  code: string;
  name: string;
  materials: { id: string; name: string; unit: string; inStock: number }[];
  activities: { id: string; name: string; code: string }[];
}

interface Line { materialId: string; quantity: string; activityId: string | null }

const istDate = (plusDays: number) => new Date(Date.now() + 5.5 * 3_600_000 + plusDays * 86_400_000).toISOString().slice(0, 10);
const NEEDED: { value: string; label: string; days: number | null }[] = [
  { value: "today", label: "Today", days: 0 },
  { value: "tomorrow", label: "Tomorrow", days: 1 },
  { value: "3d", label: "In 3 days", days: 3 },
  { value: "7d", label: "In a week", days: 7 },
];

/** Site Engineer's material request: pick material, type quantity, send. One column, big targets, no money. */
export function MaterialRequestForm({ projects }: { projects: MrProject[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<{ materialId: string | null; quantity: string; activityId: string | null }>({ materialId: null, quantity: "", activityId: null });
  const [sheet, setSheet] = useState<null | "material" | "activity">(null);
  const [needed, setNeeded] = useState<string>("tomorrow");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { id?: string; queued?: boolean }>(null);
  const [pending, start] = useTransition();
  const txn = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

  const mat = (id: string) => project?.materials.find((m) => m.id === id);
  const activityLabel = (id: string | null) => { const a = project?.activities.find((x) => x.id === id); return a ? a.name : null; };
  const usedIds = useMemo(() => new Set(lines.map((l) => l.materialId)), [lines]);

  if (!project) return <p className="text-muted">You are not assigned to an active project.</p>;

  function addLine() {
    setDraftError(null);
    const qty = Number(draft.quantity);
    if (!draft.materialId) return setDraftError("Pick a material first.");
    if (!(qty > 0)) return setDraftError("Type how much you need.");
    setLines((cur) => [...cur, { materialId: draft.materialId!, quantity: draft.quantity, activityId: draft.activityId }]);
    setDraft({ materialId: null, quantity: "", activityId: null });
  }

  function send() {
    setError(null);
    let pendingLines = lines;
    // A half-filled line that has both a material and a quantity is added for them.
    if (draft.materialId && Number(draft.quantity) > 0) {
      pendingLines = [...lines, { materialId: draft.materialId, quantity: draft.quantity, activityId: draft.activityId }];
    }
    if (pendingLines.length === 0) return setError("Add at least one material to request.");
    const d = NEEDED.find((n) => n.value === needed);
    start(async () => {
      const body = {
        neededBy: d?.days === null || d === undefined ? null : istDate(d.days),
        note: note.trim() || null,
        items: pendingLines.map((l) => ({ materialId: l.materialId, quantity: Number(l.quantity), activityId: l.activityId })),
      };
      const out = await callOrQueue(
        { type: "mr.create", projectId: project.id, clientTxnId: txn.current, payload: body, label: `Material request — ${project.code} ${project.name}` },
        () => createMaterialRequestAction(project.id, { ...body, clientTxnId: txn.current }),
      );
      try { navigator.vibrate?.(10); } catch { /* not supported */ }
      if (out.queued) return setDone({ queued: true });
      if (out.result.ok) setDone({ id: String(out.result.data) });
      else setError(out.result.error);
    });
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center gap-5 px-4 text-center" role="status">
        <h1 className="text-3xl">{done.queued ? "Request saved on your phone" : "Request sent"}</h1>
        <p className="text-[18px]">{done.queued ? "You're offline. It will go to your Project Manager automatically when you're back online." : "Your Project Manager will see it on their list. Procurement takes it from there."}</p>
        {done.id && <Link href={`/requests/mr/${done.id}`} className="flex min-h-16 w-full max-w-sm items-center justify-center rounded-xl bg-brand text-[18px] font-bold text-brand-on hover:brightness-110">See this request</Link>}
        <Link href="/requests" className="flex min-h-14 w-full max-w-sm items-center justify-center rounded-xl border-2 border-border text-[17px] font-semibold hover:bg-surface-2">My requests</Link>
      </div>
    );
  }

  const selectedMat = draft.materialId ? mat(draft.materialId) : null;
  const canSend = lines.length > 0 || (!!draft.materialId && Number(draft.quantity) > 0);

  return (
    <div className="mx-auto max-w-xl pb-40">
      <h1 className="text-2xl md:text-3xl">Request material</h1>
      <p className="mb-2 text-muted">Tell us what the site needs. No prices here.</p>

      {projects.length > 1 && (
        <section aria-labelledby="mr-project" className="mb-3">
          <SectionHeader id="mr-project" title="Project" />
          <div className="mt-3">
            <ChipGroup label="Project" value={projectId} options={projects.map((p) => ({ value: p.id, label: p.code }))} columns={Math.min(projects.length, 3)} onChange={(v) => { setProjectId(v); setLines([]); setDraft({ materialId: null, quantity: "", activityId: null }); }} />
          </div>
        </section>
      )}
      <p className="mb-2 text-[15px]"><span className="code text-muted">{project.code}</span> <span className="font-semibold">{project.name}</span></p>

      <section aria-labelledby="mr-items">
        <SectionHeader id="mr-items" title="Material needed" hint={lines.length ? `${lines.length} added` : undefined} />
        <ul className="mt-3 space-y-2">
          {lines.map((l, i) => {
            const m = mat(l.materialId);
            return (
              <li key={l.materialId} className="panel flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-semibold">{m?.name}</div>
                  <div className="text-sm text-muted">{activityLabel(l.activityId) ? `For ${activityLabel(l.activityId)}` : "No activity chosen"}</div>
                </div>
                <div className="num text-[22px] font-semibold">{l.quantity} <span className="text-base text-muted">{m?.unit}</span></div>
                <button type="button" aria-label={`Remove ${m?.name}`} onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))} className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-border text-muted hover:text-danger cursor-pointer">
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="panel mt-3 space-y-3 p-3">
          <button type="button" onClick={() => setSheet("material")} className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-border bg-bg px-4 text-left text-[17px] font-medium cursor-pointer">
            <span className={selectedMat ? "" : "text-muted"}>{selectedMat ? selectedMat.name : "Pick a material…"}</span>
            <Plus className="h-5 w-5 text-muted" aria-hidden />
          </button>
          {selectedMat && (
            <>
              <QtyInput id="mr-qty" label="How much?" unit={selectedMat.unit} value={draft.quantity} onChange={(v) => setDraft((d) => ({ ...d, quantity: v }))} />
              <p className="text-sm text-muted">In stock on site now: <strong className="num text-text">{selectedMat.inStock} {selectedMat.unit}</strong></p>
              <button type="button" onClick={() => setSheet("activity")} className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-border bg-bg px-4 text-left text-[16px] cursor-pointer">
                <span className={draft.activityId ? "" : "text-muted"}>{activityLabel(draft.activityId) ?? "For which work? (optional)"}</span>
              </button>
            </>
          )}
          {draftError && <p role="alert" className="text-[15px] text-danger">{draftError}</p>}
          <button type="button" onClick={addLine} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-brand text-[17px] font-semibold text-brand-text hover:bg-surface-2 cursor-pointer">
            <Plus className="h-5 w-5" aria-hidden />Add to request
          </button>
        </div>
      </section>

      <section aria-labelledby="mr-when" className="mt-4">
        <SectionHeader id="mr-when" title="Needed by" />
        <div className="mt-3"><ChipGroup label="Needed by" value={needed} options={NEEDED.map((n) => ({ value: n.value, label: n.label }))} columns={2} size="md" onChange={setNeeded} /></div>
      </section>

      <section aria-labelledby="mr-note" className="mt-4">
        <SectionHeader id="mr-note" title="Note" hint="Optional" />
        <textarea aria-label="Note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Brand, delivery time, anything the office should know"
          className="mt-3 min-h-20 w-full rounded-xl border-2 border-border bg-bg p-3 text-[17px] placeholder:text-muted/70" />
      </section>

      {error && <p role="alert" className="mt-4 rounded-xl border border-danger/50 p-3 text-[16px] text-danger">{error}</p>}

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-bg/95 px-4 pb-2 pt-2 backdrop-blur md:bottom-0 md:left-[248px]">
        <div className="mx-auto max-w-xl">
          <button type="button" onClick={send} disabled={pending || !canSend} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[18px] font-bold text-brand-on hover:brightness-110 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
            {pending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            {pending ? "Sending…" : "SEND MATERIAL REQUEST"}
          </button>
        </div>
      </div>

      <PickerSheet
        open={sheet === "material"} onClose={() => setSheet(null)} title="Material"
        groups={[{ label: "Materials", options: project.materials.map((m) => ({ value: m.id, label: m.name, hint: `${m.inStock} ${m.unit} in stock${usedIds.has(m.id) ? " · already added" : ""}`, disabled: usedIds.has(m.id) })) }]}
        selected={draft.materialId}
        onPick={(v) => { setDraft((d) => ({ ...d, materialId: v })); setSheet(null); }}
      />
      <PickerSheet
        open={sheet === "activity"} onClose={() => setSheet(null)} title="Work it is for"
        groups={[{ label: "Activities", options: [{ value: "", label: "No specific activity" }, ...project.activities.map((a) => ({ value: a.id, label: a.name, hint: a.code }))] }]}
        selected={draft.activityId ?? ""}
        onPick={(v) => { setDraft((d) => ({ ...d, activityId: v || null })); setSheet(null); }}
      />
    </div>
  );
}
