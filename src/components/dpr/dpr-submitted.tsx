import Link from "next/link";
import { CheckCircle2, Send } from "lucide-react";
import { dprDetail } from "@/core/dpr/queries";
import type { EngineerReport } from "@/core/dpr/queries";
import { SEVERITY_LABEL, SOURCE_LABEL, WEATHER_LABEL } from "@/core/dpr/schemas";
import { Card } from "@/components/ui/card";
import { DprStatusChip } from "@/components/status-chip";
import { requireSession } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";

/** Read-only view of today's report once it is submitted or approved. */
export async function DprSubmitted({ report }: { report: EngineerReport }) {
  const { ctx } = await requireSession();
  const d = await dprDetail(ctx, report.dpr!.id);
  const approved = d.status === "APPROVED";
  return (
    <div className="mx-auto max-w-xl space-y-4 text-[17px]">
      <div>
        <div className="code text-sm text-muted">{d.project.code}</div>
        <h1 className="text-2xl leading-snug">{d.project.name}</h1>
        <p className="mt-1 text-muted">Daily report · <span className="num font-semibold text-text">{formatDate(d.reportDate)}</span></p>
      </div>

      <Card className="flex items-start gap-3">
        {approved ? <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-brand-text" aria-hidden /> : <Send className="mt-0.5 h-7 w-7 shrink-0 text-warn" aria-hidden />}
        <div>
          <DprStatusChip status={d.status} />
          <p className="mt-2 font-semibold">
            {approved ? `Approved${d.approvedByName ? ` by ${d.approvedByName}` : ""}. Progress and stock are updated.` : `Sent${report.pmName ? ` to ${report.pmName}` : ""} for approval.`}
          </p>
          <p className="text-[15px] text-muted">
            {d.submittedByName ? `Submitted by ${d.submittedByName}` : ""}{d.submittedAt ? ` · ${formatDateTime(d.submittedAt)}` : ""}. Today’s report can’t be changed{approved ? "" : " unless the PM sends it back"}.
          </p>
        </div>
      </Card>

      <Card className="space-y-1">
        <h2 className="text-lg">Weather</h2>
        <p>{d.weather ? WEATHER_LABEL[d.weather] : "—"}{d.noWork ? " · No work today" : ""}</p>
      </Card>

      {d.progress.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Work done</h2>
          <ul className="divide-y divide-border">
            {d.progress.map((p) => (
              <li key={p.id} className="py-2">
                <div className="font-medium">{p.name}</div>
                <div className="num text-[15px] text-muted">{p.quantity} {p.unit} today · {Math.min(100, Math.round((p.cumulativeQty / p.plannedQty) * 100))}% of plan done</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {d.labour.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Labour</h2>
          <ul className="divide-y divide-border text-[16px]">
            {d.labour.map((l) => (
              <li key={l.id} className="py-2"><span className="font-medium">{l.trade}</span> · <span className="num">{l.headcount}</span> {l.headcount === 1 ? "person" : "people"} · <span className="num">{l.hours}</span> h · {SOURCE_LABEL[l.source]}{l.subcontractor ? ` (${l.subcontractor})` : ""}</li>
            ))}
          </ul>
        </Card>
      )}
      {d.materials.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Material used</h2>
          <ul className="divide-y divide-border text-[16px]">
            {d.materials.map((m) => <li key={m.id} className="py-2"><span className="font-medium">{m.material}</span> · <span className="num">{m.quantity} {m.unit}</span></li>)}
          </ul>
        </Card>
      )}
      {d.photos.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Photos</h2>
          <ul className="grid grid-cols-3 gap-2">
            {d.photos.map((p) => (
              <li key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/dpr-photo/${p.id}`} alt={p.name} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {d.issues.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Issues raised</h2>
          <ul className="space-y-1 text-[16px]">{d.issues.map((i) => <li key={i.id}><span className="font-semibold">{SEVERITY_LABEL[i.severity]}</span> · {i.title}</li>)}</ul>
        </Card>
      )}
      {d.remarks && <Card><h2 className="mb-1 text-lg">Remarks</h2><p>{d.remarks}</p></Card>}

      <Link href="/my-projects" className="flex min-h-16 w-full items-center justify-center rounded-xl border-2 border-border text-[17px] font-bold hover:bg-surface-2">Back to My Projects</Link>
    </div>
  );
}
