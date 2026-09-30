import Link from "next/link";
import { CalendarDays, CloudSun, FileText, MapPin } from "lucide-react";
import type { ClientPortalView } from "@/core/progress/service";
import { ProjectStatusChip } from "@/components/status-chip";
import { formatDate } from "@/lib/format";

const CATEGORY: Record<string, string> = {
  AGREEMENT: "Agreement", BOQ: "BOQ", DRAWINGS: "Drawings", DPR: "Report", PURCHASE_ORDERS: "Purchase orders", INVOICES: "Invoices", QUALITY: "Quality", PAYMENT: "Payment", HANDOVER: "Handover", PHOTOS: "Photos",
};

/** The homeowner's view: approved progress, the latest site updates with the photos the PM shared, released documents. No plan comparison and no internal figures. */
export function ClientHome({ v }: { v: ClientPortalView }) {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted"><span className="code">{v.code}</span><ProjectStatusChip status={v.status} /></p>
        <h1 className="text-2xl md:text-3xl">{v.name}</h1>
        <p className="inline-flex items-center gap-1.5 text-muted"><MapPin className="h-4 w-4" aria-hidden />{v.location}</p>
      </header>

      <section aria-labelledby="overall" className="space-y-3">
        <h2 id="overall" className="sr-only">Overall progress</h2>
        <p className="text-[34px] leading-none md:text-[44px]"><span className="num font-semibold text-brand-text">{v.actualPct}%</span> <span className="text-[20px] font-normal text-muted md:text-[22px]">of your home is complete</span></p>
        <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${v.actualPct} percent complete`}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, v.actualPct)}%` }} />
        </div>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-[16px]">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-muted" aria-hidden />Expected finish <span className="num font-semibold">{formatDate(v.expectedFinish)}</span>{v.promisedFinish !== v.expectedFinish && <span className="text-muted"> · originally promised <span className="num">{formatDate(v.promisedFinish)}</span></span>}</span>
          <span className="text-muted">{v.lastUpdate ? <>Last site update <span className="num text-text">{formatDate(v.lastUpdate)}</span></> : "Your first site update will appear here once your site team files and your project manager approves a daily report."}</span>
        </p>
      </section>

      {v.stages.length > 0 && (
        <section aria-labelledby="stages" className="space-y-3">
          <h2 id="stages" className="text-xl">Progress by stage</h2>
          <ul className="grid gap-x-10 gap-y-4 md:grid-cols-2">
            {v.stages.map((s) => (
              <li key={s.code}>
                <div className="mb-1 flex justify-between text-[16px]"><span className="font-medium">{s.name}</span><span className="num font-semibold">{s.actualPct}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${s.name}: ${s.actualPct} percent complete`}><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, s.actualPct)}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="latest" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="latest" className="text-xl">Latest from site</h2>
          {v.photoCount > 0 && <Link href="/photos" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-brand-text underline-offset-2 hover:underline">All {v.photoCount} photos</Link>}
        </div>
        {v.updates.length === 0 ? <p className="text-muted">No updates yet.</p> : (
          <>
            <ol className="divide-y divide-border">{v.updates.slice(0, 4).map((u) => <Update key={u.id} u={u} />)}</ol>
            {v.updates.length > 4 && (
              <details className="group">
                <summary className="inline-flex min-h-12 cursor-pointer items-center text-[15px] font-semibold text-brand-text">Earlier updates ({v.updates.length - 4})</summary>
                <ol className="divide-y divide-border">{v.updates.slice(4).map((u) => <Update key={u.id} u={u} />)}</ol>
              </details>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="docs" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="docs" className="text-xl">Documents for you</h2><Link href="/documents" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-brand-text underline-offset-2 hover:underline">All documents</Link></div>
        {v.documents.length === 0 ? <p className="text-muted">Nothing has been released to you yet.</p> : (
          <ul className="divide-y divide-border">
            {v.documents.map((d) => (
              <li key={d.id}>
                <a href={`/api/files/document/${d.versionId}`} className="flex min-h-14 items-center gap-3 py-2 hover:bg-surface-2/60">
                  <FileText className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block text-[16px] font-medium leading-snug">{d.title}</span><span className="text-sm text-muted">{CATEGORY[d.category] ?? d.category} · {formatDate(d.updatedAt)}</span></span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Update({ u }: { u: ClientPortalView["updates"][number] }) {
  return (
    <li className="py-4">
      <p className="flex flex-wrap items-center gap-x-3 text-[16px]"><span className="num font-semibold">{formatDate(u.date)}</span>{u.weather && <span className="inline-flex items-center gap-1 text-muted"><CloudSun className="h-4 w-4" aria-hidden />{u.weather}</span>}</p>
      <p className="mt-0.5 text-[16px]">{u.workedOn.length ? <>Work on <span className="font-medium">{u.workedOn.join(", ")}</span>.</> : "No site work recorded that day."}</p>
      {u.photoIds.length > 0 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {u.photoIds.map((id) => (
            <li key={id} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={`/api/files/dpr-photo/${id}`} target="_blank" rel="noreferrer"><img src={`/api/files/dpr-photo/${id}`} alt={`Site photo, ${formatDate(u.date)}`} loading="lazy" className="h-28 w-40 rounded-lg object-cover md:h-32 md:w-48" /></a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
