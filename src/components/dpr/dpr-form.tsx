"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Cloud, CloudLightning, CloudRain, History, Loader2, Plus, ShieldAlert, Sun, Trash2, TriangleAlert, Users } from "lucide-react";
import { addIssueAction, saveDraftAction, submitDprAction } from "@/actions/dpr";
import { toast } from "@/components/ui/toaster";
import { LABOUR_SOURCES, SEVERITIES, SEVERITY_LABEL, SOURCE_LABEL, WEATHER_LABEL } from "@/core/dpr/schemas";
import type { EngineerReport, ReportActivity, ReportLabour } from "@/core/dpr/queries";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PhotoCapture, type PhotoStats } from "./photo-capture";
import { ChipGroup, PickerSheet, QtyInput, SectionHeader, Stepper, type PickGroup } from "./ui";
import { SuccessScreen } from "./success-screen";

type Weather = keyof typeof WEATHER_LABEL;
type Source = (typeof LABOUR_SOURCES)[number];
type Severity = (typeof SEVERITIES)[number];

interface LabourRow { key: string; tradeId: string; source: Source; subcontractorId: string | null; headcount: number; hours: number; open: boolean }
interface Line { key: string; activityId: string; quantity: string; labour: LabourRow[] }
interface MatLine { key: string; activityId: string; materialId: string; quantity: string }

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));
const OVERRUN = 1.1;
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const HOURS = [4, 6, 8, 10];

const WEATHER_OPTIONS = [
  { value: "SUNNY" as const, label: WEATHER_LABEL.SUNNY, icon: <Sun className="h-6 w-6" aria-hidden /> },
  { value: "CLOUDY" as const, label: WEATHER_LABEL.CLOUDY, icon: <Cloud className="h-6 w-6" aria-hidden /> },
  { value: "RAIN" as const, label: WEATHER_LABEL.RAIN, icon: <CloudRain className="h-6 w-6" aria-hidden /> },
  { value: "HEAVY_RAIN" as const, label: WEATHER_LABEL.HEAVY_RAIN, icon: <CloudLightning className="h-6 w-6" aria-hidden /> },
];

function toLabourRow(l: ReportLabour, open: boolean): LabourRow {
  return { key: uid(), tradeId: l.tradeId, source: l.source, subcontractorId: l.subcontractorId, headcount: l.headcount, hours: l.hours, open };
}

/** Starting lines: the saved draft if there is one, otherwise yesterday's activities with yesterday's crew. */
function initialLines(report: EngineerReport): Line[] {
  const known = new Set(report.activities.map((a) => a.id));
  if (report.dpr && (report.dpr.progress.length > 0 || report.dpr.labour.length > 0)) {
    const ids = [...new Set([...report.dpr.progress.map((p) => p.activityId), ...report.dpr.labour.flatMap((l) => (l.activityId ? [l.activityId] : []))])];
    return ids.filter((id) => known.has(id)).map((id) => ({
      key: uid(), activityId: id,
      quantity: report.dpr!.progress.find((p) => p.activityId === id)?.quantity.toString() ?? "",
      labour: report.dpr!.labour.filter((l) => l.activityId === id).map((l) => toLabourRow(l, false)),
    }));
  }
  if (report.yesterday) {
    return report.yesterday.activityIds.filter((id) => known.has(id)).map((id) => ({
      key: uid(), activityId: id, quantity: "",
      labour: report.yesterday!.labour.filter((l) => l.activityId === id).map((l) => toLabourRow(l, false)),
    }));
  }
  return [];
}

export function DprForm({ report }: { report: EngineerReport }) {
  const projectId = report.project.id;
  const actMap = useMemo(() => new Map(report.activities.map((a) => [a.id, a])), [report.activities]);
  const matMap = useMemo(() => new Map(report.materials.map((m) => [m.id, m])), [report.materials]);
  const tradeName = useMemo(() => new Map(report.trades.map((t) => [t.value, t.label])), [report.trades]);
  const subName = useMemo(() => new Map(report.subcontractors.map((s) => [s.id, s.name])), [report.subcontractors]);

  const [weather, setWeather] = useState<Weather | null>(report.dpr?.weather ?? report.lastWeather ?? null);
  const [noWork, setNoWork] = useState(report.dpr?.noWork ?? false);
  const [remarks, setRemarks] = useState(report.dpr?.remarks ?? "");
  const [lines, setLines] = useState<Line[]>(() => initialLines(report));
  const [mats, setMats] = useState<MatLine[]>(() =>
    (report.dpr?.materials ?? []).map((m) => ({ key: uid(), activityId: m.activityId, materialId: m.materialId, quantity: m.quantity.toString() })),
  );
  const [issues, setIssues] = useState(report.issues);
  const [photoStats, setPhotoStats] = useState<PhotoStats>({ saved: report.dpr?.photos.length ?? 0, uploading: 0, failed: 0 });
  const [picker, setPicker] = useState<null | { kind: "activity" } | { kind: "trade"; line: string; row: string } | { kind: "sub"; line: string; row: string } | { kind: "material"; mat: string | "new" } | { kind: "matActivity"; mat: string }>(null);
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; at?: string; message?: string }>({ kind: "idle" });
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { pmName: string | null }>(null);
  const [pending, startSubmit] = useTransition();

  // ── validation shared by autosave and submit ──
  const lineError = useCallback(
    (l: Line): string | null => {
      const a = actMap.get(l.activityId);
      const q = parseFloat(l.quantity);
      if (!a || !Number.isFinite(q)) return null;
      const room = a.plannedQty * OVERRUN - a.actualQty;
      if (q > room + 1e-9) {
        const left = Math.max(0, a.plannedQty - a.actualQty);
        return `Only ${fmt(left)} ${a.unit} left on ${a.name} (planned ${fmt(a.plannedQty)}, done ${fmt(a.actualQty)}). Enter ${fmt(Math.max(0, room))} or less, or ask your PM to raise the planned quantity.`;
      }
      return null;
    },
    [actMap],
  );
  const validLines = lines.filter((l) => !lineError(l));

  const payload = useMemo(() => {
    const progress = validLines.filter((l) => l.quantity !== "" || l.labour.length > 0).map((l) => ({ activityId: l.activityId, quantity: parseFloat(l.quantity) || 0 }));
    const labour = validLines.flatMap((l) =>
      l.labour.filter((r) => r.source !== "SUBCONTRACTOR" || r.subcontractorId).map((r) => ({
        activityId: l.activityId, source: r.source, tradeId: r.tradeId, subcontractorId: r.source === "SUBCONTRACTOR" ? r.subcontractorId : null, headcount: r.headcount, hours: r.hours,
      })),
    );
    const linked = new Set(validLines.map((l) => l.activityId));
    const materials = mats
      .filter((m) => m.materialId && m.activityId && linked.has(m.activityId) && parseFloat(m.quantity) > 0)
      .map((m) => ({ activityId: m.activityId, materialId: m.materialId, quantity: parseFloat(m.quantity) }));
    return { weather, remarks: remarks.trim() || null, noWork, progress, labour, materials };
  }, [validLines, mats, weather, remarks, noWork]);
  const payloadJson = JSON.stringify(payload);

  // ── autosave (debounced). Prefilled-but-untouched forms are not saved. ──
  const lastSaved = useRef(payloadJson);
  const seq = useRef(0);
  const doSave = useCallback(async () => {
    const mine = ++seq.current;
    const sending = payloadJson;
    setSaveState({ kind: "saving" });
    try {
      const res = await saveDraftAction(projectId, JSON.parse(sending));
      if (mine !== seq.current) return;
      if (res.ok) {
        lastSaved.current = sending;
        setServerErrors({});
        setSaveState({ kind: "saved", at: new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }) });
      } else {
        setServerErrors(res.fieldErrors ?? {});
        setSaveState({ kind: "error", message: res.error });
      }
    } catch {
      if (mine === seq.current) setSaveState({ kind: "error", message: "No signal. Your entries are kept on this screen — tap to try again." });
    }
  }, [payloadJson, projectId]);

  useEffect(() => {
    if (payloadJson === lastSaved.current || done) return;
    const t = window.setTimeout(() => void doSave(), 1200);
    return () => window.clearTimeout(t);
  }, [payloadJson, doSave, done]);

  // ── line helpers ──
  const setLine = (key: string, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setRow = (lineKey: string, rowKey: string, patch: Partial<LabourRow>) =>
    setLines((cur) => cur.map((l) => (l.key === lineKey ? { ...l, labour: l.labour.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)) } : l)));
  const defaultRow = (a: ReportActivity | undefined): LabourRow => {
    const y = report.yesterday?.labour.find((l) => l.tradeId === a?.tradeId);
    return { key: uid(), tradeId: a?.tradeId ?? report.trades[0]?.value ?? "", source: y?.source ?? "CONTRACT_LABOUR", subcontractorId: y?.subcontractorId ?? null, headcount: y?.headcount ?? 4, hours: 8, open: true };
  };
  const addActivity = (id: string) => {
    const a = actMap.get(id);
    const y = report.yesterday?.labour.filter((l) => l.activityId === id) ?? [];
    setLines((cur) => [...cur, { key: uid(), activityId: id, quantity: "", labour: y.length ? y.map((l) => toLabourRow(l, false)) : [defaultRow(a)] }]);
  };
  const copyYesterday = () => {
    if (!report.yesterday) return;
    setLines((cur) => {
      const have = new Set(cur.map((l) => l.activityId));
      const extra = report.yesterday!.activityIds.filter((id) => actMap.has(id) && !have.has(id)).map((id) => ({
        key: uid(), activityId: id, quantity: "", labour: report.yesterday!.labour.filter((l) => l.activityId === id).map((l) => toLabourRow(l, false)),
      }));
      return [...cur, ...extra];
    });
  };
  const sameAsYesterday = (line: Line) => {
    const y = report.yesterday?.labour.filter((l) => l.activityId === line.activityId) ?? [];
    if (y.length) setLine(line.key, { labour: y.map((l) => toLabourRow(l, false)) });
  };

  // ── issues ──
  const [issueTitle, setIssueTitle] = useState("");
  const [issueSeverity, setIssueSeverity] = useState<Severity | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  async function addIssue() {
    setIssueBusy(true);
    const res = await addIssueAction(projectId, { title: issueTitle, severity: issueSeverity, clientTxnId: uid() });
    setIssueBusy(false);
    if (!res.ok) return toast("error", res.fieldErrors?.title ?? res.fieldErrors?.severity ?? res.error);
    toast("success", "Issue reported to your PM.");
    setIssues((cur) => [{ id: String(res.data), code: "NEW", title: issueTitle, severity: issueSeverity ?? "MEDIUM", status: "OPEN" }, ...cur]);
    setIssueTitle(""); setIssueSeverity(null); setIssueOpen(false);
  }

  // ── readiness ──
  const totalQty = validLines.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0);
  const invalidCount = lines.length - validLines.length;
  const missingSub = lines.some((l) => l.labour.some((r) => r.source === "SUBCONTRACTOR" && !r.subcontractorId));
  const linkedIds = new Set(validLines.map((l) => l.activityId));
  const matNeedsActivity = mats.some((m) => m.materialId && parseFloat(m.quantity) > 0 && (!m.activityId || !linkedIds.has(m.activityId)));
  const reason = !weather ? "Pick today’s weather"
    : noWork ? (remarks.trim().length < 3 ? "Say why no work was done today" : null)
    : invalidCount > 0 ? "Fix the quantity marked in red"
    : missingSub ? "Pick the subcontractor for the labour line"
    : matNeedsActivity ? "Pick which activity the material was used on"
    : totalQty <= 0 ? "Enter a quantity for at least one activity"
    : photoStats.uploading > 0 ? "Photos are still uploading…"
    : null;
  const canSubmit = !reason && !pending;

  function submit() {
    setSubmitError(null);
    if (photoStats.failed > 0 && !window.confirm(`${photoStats.failed} photo(s) haven't uploaded, and won't be part of this report. Submit anyway?`)) return;
    startSubmit(async () => {
      const res = await submitDprAction(projectId, JSON.parse(payloadJson));
      if (res.ok) {
        lastSaved.current = payloadJson;
        try { navigator.vibrate?.(10); } catch { /* not supported */ }
        // Keep the success screen up; the next visit to this page loads the locked, read-only report.
        setDone({ pmName: res.data?.pmName ?? report.pmName });
      } else {
        setServerErrors(res.fieldErrors ?? {});
        setSubmitError(res.error);
      }
    });
  }

  // ── picker content ──
  const usedActivities = new Set(lines.map((l) => l.activityId));
  const activityGroups: PickGroup[] = [
    { label: "Today’s work", options: report.activities.filter((a) => a.today && !usedActivities.has(a.id)).map(actOption) },
    { label: "Other activities", options: report.activities.filter((a) => !a.today && !usedActivities.has(a.id)).map(actOption) },
  ];
  function actOption(a: ReportActivity) {
    return { value: a.id, label: a.name, hint: `${a.wbs} · ${fmt(a.actualQty)} of ${fmt(a.plannedQty)} ${a.unit} done` };
  }
  const materialGroups: PickGroup[] = useMemo(() => {
    const forToday = new Set(lines.flatMap((l) => report.materials.filter((m) => m.forActivityIds.includes(l.activityId)).map((m) => m.id)));
    const opt = (m: EngineerReport["materials"][number]) => ({ value: m.id, label: m.name, hint: m.available > 0 ? `In stock: ${fmt(m.available)} ${m.unit}` : "None in stock" });
    return [
      { label: "For today’s work", options: report.materials.filter((m) => forToday.has(m.id)).map(opt) },
      { label: "In stock", options: report.materials.filter((m) => !forToday.has(m.id) && m.available > 0).map(opt) },
      { label: "Not in stock", options: report.materials.filter((m) => !forToday.has(m.id) && m.available <= 0).map(opt) },
    ];
  }, [report.materials, lines]);

  if (done) return <SuccessScreen pmName={done.pmName} projectName={report.project.name} />;

  const errFor = (path: string) => serverErrors[path];

  return (
    <div className="mx-auto max-w-xl pb-44 text-[17px] md:pb-32">
      {/* Header */}
      <div className="mb-4">
        <div className="code text-sm text-muted">{report.project.code}</div>
        <h1 className="text-2xl leading-snug">{report.project.name}</h1>
        <p className="mt-1 text-muted">Daily report · <span className="num font-semibold text-text">{formatDate(report.reportDate)}</span></p>
      </div>

      {report.dpr?.status === "REJECTED" && (
        <div role="alert" className="mb-4 flex gap-3 rounded-xl border-2 border-danger p-4">
          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold">Your PM sent this report back</p>
            <p className="mt-1">{report.dpr.rejectionReason}</p>
            <p className="mt-1 text-sm text-muted">Fix it below and submit again.</p>
          </div>
        </div>
      )}
      {report.dpr && report.dpr.teammateLines > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-border p-3 text-[15px] text-muted">
          <Users className="h-5 w-5 shrink-0" aria-hidden /> {report.dpr.teammateLines} lines in this report were added by your teammates. You are editing only your own lines.
        </p>
      )}

      {/* Weather */}
      <SectionHeader id="s-weather" title="Weather" />
      <section aria-labelledby="s-weather" className="space-y-3 py-4">
        <ChipGroup label="Weather" value={weather} options={WEATHER_OPTIONS} onChange={setWeather} />
        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-border px-4">
          <input type="checkbox" checked={noWork} onChange={(e) => setNoWork(e.target.checked)} className="h-7 w-7 accent-[rgb(var(--brand))]" />
          <span className="font-semibold">No work today</span>
          <span className="text-sm text-muted">(rain, holiday…)</span>
        </label>
      </section>

      {/* Work done */}
      <SectionHeader
        id="s-work" title="Work done" hint={`${lines.length} ${lines.length === 1 ? "activity" : "activities"}`}
        right={report.yesterday && report.yesterday.activityIds.some((id) => actMap.has(id) && !usedActivities.has(id)) ? (
          <button type="button" onClick={copyYesterday} className="flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-[15px] font-semibold text-brand-text hover:bg-surface-2 cursor-pointer">
            <History className="h-5 w-5" aria-hidden /> Copy yesterday
          </button>
        ) : undefined}
      />
      <section aria-labelledby="s-work" className={cn("space-y-4 py-4", noWork && "opacity-60")}>
        {errFor("progress") && <p role="alert" className="text-danger">{errFor("progress")}</p>}
        {lines.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-muted">
            {report.yesterday ? "Nothing carried over from yesterday." : "No work added yet."} Tap <strong>Add activity</strong> and pick what was worked on today.
          </p>
        )}
        {lines.map((l, idx) => {
          const a = actMap.get(l.activityId);
          if (!a) return null;
          const err = lineError(l) ?? errFor(`progress.${payload.progress.findIndex((p) => p.activityId === l.activityId)}.quantity`);
          const q = parseFloat(l.quantity) || 0;
          const doneAfter = a.actualQty + q;
          const pct = Math.min(100, (doneAfter / a.plannedQty) * 100);
          const yHas = (report.yesterday?.labour ?? []).some((y) => y.activityId === l.activityId);
          return (
            <article key={l.key} className="panel space-y-4 p-4" aria-label={`Activity ${idx + 1}: ${a.name}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[18px] leading-snug">{a.name}</h3>
                  <p className="num mt-0.5 text-[15px] text-muted">{fmt(a.actualQty)} of {fmt(a.plannedQty)} {a.unit} done · {fmt(Math.max(0, a.plannedQty - a.actualQty))} left</p>
                </div>
                <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))} className="-mr-2 -mt-1 grid h-14 w-14 shrink-0 place-items-center rounded-xl text-muted hover:text-danger cursor-pointer">
                  <Trash2 className="h-6 w-6" aria-hidden />
                </button>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${Math.round(pct)} percent done including today`}>
                <div className="h-full rounded-full bg-brand transition-[width] duration-base" style={{ width: `${pct}%` }} />
              </div>
              <QtyInput id={`qty-${l.key}`} label="Quantity done today" unit={a.unit} value={l.quantity} onChange={(v) => setLine(l.key, { quantity: v })} invalid={!!err} />
              {err && <p role="alert" className="flex gap-2 text-[15px] text-danger"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />{err}</p>}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold">Labour</h4>
                  {yHas && (
                    <button type="button" onClick={() => sameAsYesterday(l)} className="flex min-h-12 items-center gap-1.5 rounded-xl border-2 border-border px-3 text-[15px] font-semibold hover:bg-surface-2 cursor-pointer">
                      <History className="h-5 w-5" aria-hidden /> Same as yesterday
                    </button>
                  )}
                </div>
                {l.labour.map((r) => {
                  const rowErr = errFor(`labour.${payload.labour.findIndex((p) => p.activityId === l.activityId && p.tradeId === r.tradeId)}.subcontractorId`);
                  const mandays = (r.headcount * r.hours) / 8;
                  return (
                    <div key={r.key} className="rounded-xl border border-border p-3">
                      {!r.open ? (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[16px]">
                            <span className="font-semibold">{tradeName.get(r.tradeId) ?? "Trade"}</span> · <span className="num">{r.headcount}</span> {r.headcount === 1 ? "person" : "people"} · <span className="num">{r.hours}</span> h · {SOURCE_LABEL[r.source]}
                            {r.subcontractorId ? ` (${subName.get(r.subcontractorId) ?? "subcontractor"})` : ""}
                          </p>
                          <button type="button" onClick={() => setRow(l.key, r.key, { open: true })} className="min-h-12 shrink-0 rounded-xl px-3 font-semibold text-brand-text hover:bg-surface-2 cursor-pointer">Edit</button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <p className="mb-1 text-[15px] font-medium">Trade</p>
                            <button type="button" onClick={() => setPicker({ kind: "trade", line: l.key, row: r.key })} className="flex min-h-14 w-full items-center justify-between rounded-xl border-2 border-border px-4 text-left text-[17px] font-semibold hover:bg-surface-2 cursor-pointer">
                              {tradeName.get(r.tradeId) ?? "Pick a trade"} <span className="text-sm font-medium text-muted">Change</span>
                            </button>
                          </div>
                          <div>
                            <p className="mb-1 text-[15px] font-medium">People</p>
                            <Stepper label="people" value={r.headcount} onChange={(n) => setRow(l.key, r.key, { headcount: n })} />
                          </div>
                          <div>
                            <p className="mb-1 text-[15px] font-medium">Hours worked</p>
                            <ChipGroup label="Hours worked" size="md" value={String(r.hours)} onChange={(v) => setRow(l.key, r.key, { hours: Number(v) })}
                              options={(HOURS.includes(r.hours) ? HOURS : [...HOURS, r.hours].sort((x, y) => x - y)).map((h) => ({ value: String(h), label: `${h} h` }))} />
                          </div>
                          <div>
                            <p className="mb-1 text-[15px] font-medium">Labour source</p>
                            <ChipGroup label="Labour source" size="md" columns={2} value={r.source}
                              onChange={(v) => setRow(l.key, r.key, { source: v, subcontractorId: v === "SUBCONTRACTOR" ? r.subcontractorId : null })}
                              options={LABOUR_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
                          </div>
                          {r.source === "SUBCONTRACTOR" && (
                            <div>
                              <p className="mb-1 text-[15px] font-medium">Subcontractor</p>
                              <button type="button" onClick={() => setPicker({ kind: "sub", line: l.key, row: r.key })} className={cn("flex min-h-14 w-full items-center justify-between rounded-xl border-2 px-4 text-left text-[17px] font-semibold hover:bg-surface-2 cursor-pointer", rowErr ? "border-danger" : "border-border")}>
                                {r.subcontractorId ? subName.get(r.subcontractorId) : "Pick the subcontractor"} <span className="text-sm font-medium text-muted">Change</span>
                              </button>
                              {rowErr && <p role="alert" className="mt-1 text-[15px] text-danger">{rowErr}</p>}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                            <span className="num text-[15px] text-muted">= {Number(mandays.toFixed(2))} mandays</span>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => setRow(l.key, r.key, { open: false })} className="min-h-12 rounded-xl px-4 font-semibold text-brand-text hover:bg-surface-2 cursor-pointer">Done</button>
                              <button type="button" aria-label="Remove this labour line" onClick={() => setLine(l.key, { labour: l.labour.filter((x) => x.key !== r.key) })} className="grid h-12 w-12 place-items-center rounded-xl text-muted hover:text-danger cursor-pointer"><Trash2 className="h-5 w-5" aria-hidden /></button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={() => setLine(l.key, { labour: [...l.labour, defaultRow(a)] })} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-[16px] font-semibold text-brand-text hover:bg-surface-2 cursor-pointer">
                  <Plus className="h-5 w-5" aria-hidden /> Add labour
                </button>
              </div>
            </article>
          );
        })}
        <button type="button" onClick={() => setPicker({ kind: "activity" })} disabled={activityGroups.every((g) => g.options.length === 0)}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-text/60 text-[18px] font-semibold text-brand-text hover:bg-surface-2 disabled:opacity-50 cursor-pointer">
          <Plus className="h-6 w-6" aria-hidden /> Add activity
        </button>
      </section>

      {/* Material used */}
      <SectionHeader id="s-material" title="Material used" hint="Optional" />
      <section aria-labelledby="s-material" className="space-y-3 py-4">
        {mats.map((m, i) => {
          const mat = matMap.get(m.materialId);
          const q = parseFloat(m.quantity) || 0;
          const short = mat ? q > mat.available + 1e-9 : false;
          const act = actMap.get(m.activityId);
          const linked = lines.some((l) => l.activityId === m.activityId);
          return (
            <article key={m.key} className="panel space-y-3 p-4" aria-label={`Material ${i + 1}`}>
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => setPicker({ kind: "material", mat: m.key })} className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-border px-4 text-left text-[17px] font-semibold hover:bg-surface-2 cursor-pointer">
                  {mat?.name ?? "Pick a material"}
                  {mat && <span className={cn("num block text-sm font-medium", mat.available > 0 ? "text-muted" : "text-warn")}>In stock: {fmt(mat.available)} {mat.unit}</span>}
                </button>
                <button type="button" aria-label="Remove material" onClick={() => setMats((cur) => cur.filter((x) => x.key !== m.key))} className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-muted hover:text-danger cursor-pointer"><Trash2 className="h-6 w-6" aria-hidden /></button>
              </div>
              <QtyInput id={`mat-${m.key}`} label="Quantity used" unit={mat?.unit ?? ""} value={m.quantity} onChange={(v) => setMats((cur) => cur.map((x) => (x.key === m.key ? { ...x, quantity: v } : x)))} invalid={short} />
              {short && mat && (
                <p role="alert" className="flex gap-2 text-[15px] text-warn">
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                  Only {fmt(mat.available)} {mat.unit} of {mat.name} in stock. You can still submit, but your PM can&apos;t approve more than what is in stock — reduce the quantity or ask the store to record a receipt.
                </p>
              )}
              <div>
                <p className="mb-1 text-[15px] font-medium">Used on</p>
                <button type="button" onClick={() => setPicker({ kind: "matActivity", mat: m.key })} className={cn("flex min-h-14 w-full items-center justify-between rounded-xl border-2 px-4 text-left text-[17px] font-semibold hover:bg-surface-2 cursor-pointer", (m.activityId && !linked) || (q > 0 && !m.activityId) ? "border-danger" : "border-border")}>
                  {act?.name ?? "Pick the activity"} <span className="text-sm font-medium text-muted">Change</span>
                </button>
                {q > 0 && !m.activityId && <p role="alert" className="mt-1 text-[15px] text-danger">Pick the activity this material was used on.</p>}
                {m.activityId && !linked && <p role="alert" className="mt-1 text-[15px] text-danger">Add this activity under Work done first.</p>}
              </div>
            </article>
          );
        })}
        <button type="button" onClick={() => setPicker({ kind: "material", mat: "new" })} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-[17px] font-semibold text-brand-text hover:bg-surface-2 cursor-pointer">
          <Plus className="h-6 w-6" aria-hidden /> Add material
        </button>
      </section>

      {/* Photos */}
      <SectionHeader id="s-photos" title="Photos" hint={photoStats.saved > 0 ? `${photoStats.saved} saved` : undefined} />
      <section aria-labelledby="s-photos" className="py-4">
        <PhotoCapture projectId={projectId} initial={report.dpr?.photos ?? []} onStats={setPhotoStats} />
      </section>

      {/* Issues and remarks */}
      <SectionHeader id="s-issues" title="Issues and remarks" />
      <section aria-labelledby="s-issues" className="space-y-4 py-4">
        {issues.length > 0 && (
          <ul className="space-y-2" aria-label="Open issues on this project">
            {issues.map((i) => (
              <li key={i.id} className="flex items-start gap-2 rounded-xl border border-border p-3 text-[16px]">
                <span className={cn("mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-bold", i.severity === "CRITICAL" ? "border-danger text-danger" : i.severity === "HIGH" ? "border-warn text-warn" : "border-border text-muted")}>
                  {SEVERITY_LABEL[i.severity as Severity]}
                </span>
                <span>{i.title}</span>
              </li>
            ))}
          </ul>
        )}
        {!issueOpen ? (
          <button type="button" onClick={() => setIssueOpen(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-[17px] font-semibold text-brand-text hover:bg-surface-2 cursor-pointer">
            <Plus className="h-6 w-6" aria-hidden /> Report an issue
          </button>
        ) : (
          <div className="panel space-y-3 p-4">
            <div>
              <label htmlFor="issue-title" className="mb-1 block text-[15px] font-medium">What is the problem?</label>
              <input id="issue-title" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} maxLength={160} className="min-h-14 w-full rounded-xl border-2 border-border bg-bg px-4 text-[17px]" />
            </div>
            <div>
              <p className="mb-1 text-[15px] font-medium">How serious?</p>
              <ChipGroup label="Severity" size="md" columns={2} value={issueSeverity} onChange={setIssueSeverity} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIssueOpen(false)} className="min-h-12 rounded-xl px-4 font-semibold text-muted cursor-pointer">Cancel</button>
              <button type="button" disabled={issueBusy || issueTitle.trim().length < 3 || !issueSeverity} onClick={() => void addIssue()} className="flex min-h-12 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-on disabled:opacity-50 cursor-pointer">
                {issueBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Report issue
              </button>
            </div>
          </div>
        )}
        <div>
          <label htmlFor="remarks" className="mb-1 block text-[15px] font-medium">Remarks{noWork ? " (say why no work was done)" : " (optional)"}</label>
          <textarea id="remarks" rows={4} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={2000} className={cn("w-full rounded-xl border-2 bg-bg px-4 py-3 text-[17px]", errFor("remarks") ? "border-danger" : "border-border")} />
          {errFor("remarks") && <p role="alert" className="mt-1 text-[15px] text-danger">{errFor("remarks")}</p>}
        </div>
      </section>

      {/* Pinned submit bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-bg/95 px-4 pb-2 pt-2 backdrop-blur md:bottom-0 md:left-[248px]">
        <div className="mx-auto max-w-xl">
          <p className="mb-1 flex min-h-5 items-center gap-1 truncate text-sm" aria-live="polite">
            {reason ? (
              <span className="truncate font-medium text-warn">{reason}</span>
            ) : saveState.kind === "saving" ? (
              <span className="inline-flex items-center gap-1 text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…</span>
            ) : saveState.kind === "saved" ? (
              <span className="truncate text-muted">Saved {saveState.at}. You can leave and come back.</span>
            ) : saveState.kind === "error" ? (
              <button type="button" onClick={() => void doSave()} className="truncate text-left text-danger underline">{saveState.message} Tap to retry.</button>
            ) : (
              <span className="text-muted">Your entries save automatically.</span>
            )}
          </p>
          {submitError && <p role="alert" className="mb-1 rounded-lg border border-danger px-2 py-1 text-sm text-danger">{submitError}</p>}
          <button
            type="button" onClick={submit} disabled={!canSubmit}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[18px] font-bold tracking-wide text-brand-on transition-[filter] duration-fast hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {pending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            {pending ? "SENDING…" : "SUBMIT DAILY REPORT"}
          </button>
        </div>
      </div>

      {/* Pickers */}
      <PickerSheet open={picker?.kind === "activity"} onClose={() => setPicker(null)} title="Add activity" groups={activityGroups}
        onPick={(id) => { addActivity(id); setPicker(null); }} emptyText="Every open activity is already in this report." />
      <PickerSheet open={picker?.kind === "trade"} onClose={() => setPicker(null)} title="Trade" groups={[{ label: "Trades", options: report.trades.map((t) => ({ value: t.value, label: t.label })) }]}
        selected={picker?.kind === "trade" ? lines.find((l) => l.key === picker.line)?.labour.find((r) => r.key === picker.row)?.tradeId : null}
        onPick={(v) => { if (picker?.kind === "trade") setRow(picker.line, picker.row, { tradeId: v }); setPicker(null); }} />
      <PickerSheet open={picker?.kind === "sub"} onClose={() => setPicker(null)} title="Subcontractor"
        groups={[{ label: "Subcontractors", options: report.subcontractors.map((s) => ({ value: s.id, label: s.name, hint: tradeName.get(s.tradeId) })) }]}
        onPick={(v) => { if (picker?.kind === "sub") setRow(picker.line, picker.row, { subcontractorId: v }); setPicker(null); }} />
      <PickerSheet open={picker?.kind === "material"} onClose={() => setPicker(null)} title="Material" groups={materialGroups}
        selected={picker?.kind === "material" && picker.mat !== "new" ? mats.find((m) => m.key === picker.mat)?.materialId : null}
        onPick={(v) => {
          if (picker?.kind === "material") {
            if (picker.mat === "new") setMats((cur) => [...cur, { key: uid(), materialId: v, quantity: "", activityId: lines.find((l) => report.materials.find((m) => m.id === v)?.forActivityIds.includes(l.activityId))?.activityId ?? lines[0]?.activityId ?? "" }]);
            else setMats((cur) => cur.map((x) => (x.key === picker.mat ? { ...x, materialId: v } : x)));
          }
          setPicker(null);
        }} />
      <PickerSheet open={picker?.kind === "matActivity"} onClose={() => setPicker(null)} title="Used on activity"
        groups={[{ label: "Activities in this report", options: lines.map((l) => ({ value: l.activityId, label: actMap.get(l.activityId)?.name ?? "Activity" })) }]}
        emptyText="Add an activity under Work done first."
        onPick={(v) => { if (picker?.kind === "matActivity") setMats((cur) => cur.map((x) => (x.key === picker.mat ? { ...x, activityId: v } : x))); setPicker(null); }} />

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/my-projects" className="underline">Back to My Projects</Link>
      </p>
    </div>
  );
}
