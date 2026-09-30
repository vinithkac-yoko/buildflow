"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EngineerReport } from "@/core/dpr/queries";
import { dprKey } from "@/lib/offline/queue-call";
import { listOutbox, subscribeOutbox, type OutboxItem } from "@/lib/offline/outbox";
import { DprForm } from "./dpr-form";
import { SuccessScreen } from "./success-screen";

type Payload = {
  weather?: EngineerReport["lastWeather"]; remarks?: string | null; noWork?: boolean;
  progress?: { activityId: string; quantity: number }[];
  labour?: { activityId?: string | null; source: string; tradeId: string; subcontractorId?: string | null; headcount: number; hours: number }[];
  materials?: { activityId: string; materialId: string; quantity: number }[];
};

/** Lay a report saved on this phone over what the server last knew, so a reload without a signal loses nothing. */
function withLocalDraft(report: EngineerReport, p: Payload): EngineerReport {
  const base = report.dpr ?? { id: "", status: "DRAFT" as const, weather: null, remarks: null, noWork: false, rejectionReason: null, submittedByName: null, submittedAt: null, progress: [], labour: [], materials: [], photos: [], teammateLines: 0 };
  return {
    ...report,
    dpr: {
      ...base,
      weather: p.weather ?? base.weather, remarks: p.remarks ?? base.remarks, noWork: p.noWork ?? base.noWork,
      progress: p.progress ?? base.progress,
      labour: (p.labour ?? []).map((l) => ({ activityId: l.activityId ?? null, source: l.source as never, tradeId: l.tradeId, subcontractorId: l.subcontractorId ?? null, headcount: l.headcount, hours: l.hours })),
      materials: p.materials ?? base.materials,
    },
  };
}

/**
 * Wraps the daily report with what is saved on this phone: a submitted-while-offline report shows as "saved on your phone",
 * and an unsent draft (or a report the server refused) comes back into the form.
 */
export function DprOffline({ report }: { report: EngineerReport }) {
  const router = useRouter();
  const saveKey = dprKey("save", report.project.id, report.reportDate);
  const submitKey = dprKey("submit", report.project.id, report.reportDate);
  const [ready, setReady] = useState(false);
  const [queuedAtOpen, setQueuedAtOpen] = useState(false); // a report submitted offline earlier is still waiting to send
  // What was saved on the phone when this screen opened. Fixed for the visit: later autosaves must not remount the form under the engineer's fingers.
  const [boot, setBoot] = useState<OutboxItem | null>(null);
  const first = useRef(true);
  const hadSubmit = useRef(false);

  useEffect(() => {
    const read = async () => {
      const items = await listOutbox();
      const submit = items.find((i) => i.clientTxnId === submitKey) ?? null;
      const save = items.find((i) => i.clientTxnId === saveKey) ?? null;
      const pending = !!submit && (submit.status === "pending" || submit.status === "syncing");
      if (hadSubmit.current && !submit) router.refresh(); // it was sent: load the locked report from the server
      hadSubmit.current = pending;
      if (first.current) { first.current = false; setQueuedAtOpen(pending); setBoot(pending ? null : (submit ?? save)); } // a refused report comes back as an editable draft
      setReady(true);
    };
    void read();
    return subscribeOutbox(() => void read());
  }, [saveKey, submitKey, router]);

  if (!ready) return <div className="mx-auto max-w-xl py-10 text-muted" role="status">Opening today&apos;s report…</div>;

  if (queuedAtOpen) return <SuccessScreen pmName={report.pmName} projectName={report.project.name} queued />;
  const patched = boot ? withLocalDraft(report, boot.payload as Payload) : report;
  return <DprForm key={`${report.dpr?.id ?? "new"}:${report.dpr?.status ?? "none"}:${boot ? "local" : "server"}`} report={patched} />;
}
