import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { setPhotoVisibleAction } from "@/actions/dpr";
import { can } from "@/core/auth/permissions";
import { dprDetail, listDprs } from "@/core/dpr/queries";
import { SEVERITY_LABEL, SOURCE_LABEL, WEATHER_LABEL } from "@/core/dpr/schemas";
import { AppError } from "@/core/errors";
import { ActionButton } from "@/components/forms/action-button";
import { ApproveControls } from "@/components/dpr/approve-controls";
import { DprStatusChip } from "@/components/status-chip";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate, formatDateTime, formatInr } from "@/lib/format";

export const metadata = { title: "Daily report" };

export default async function DprDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, user } = await requireSession();
  if (user.role === "SITE_ENGINEER") notFound(); // engineers see only today's report on their own screen
  let d;
  try {
    d = await dprDetail(ctx, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const decide = d.status === "SUBMITTED" && d.canApprove;
  const next = decide ? (await listDprs(ctx, { status: "SUBMITTED", take: 10 })).find((r) => r.id !== d.id) : null;
  const totalMandays = d.labour.reduce((s, l) => s + l.mandays, 0);
  const showCost = d.labour.some((l) => l.dailyLabourCost !== undefined);
  const labourCost = d.labour.reduce((s, l) => s + (l.dailyLabourCost ?? 0), 0);
  const canShare = can(ctx, "update", "photo", d.projectId);

  const effects = [
    `${d.progress.filter((p) => p.quantity > 0).length} activities get today's quantities and their status updated`,
    `${Math.round(totalMandays * 10) / 10} mandays roll up to the activities`,
    d.materials.length ? `${d.materials.length} material line${d.materials.length > 1 ? "s" : ""} are issued from project stock` : "no material is issued",
  ].join("; ") + ".";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/progress" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft className="h-4 w-4" aria-hidden /> All reports</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="code text-sm text-muted">{d.project.code}</div>
          <h1 className="text-2xl md:text-3xl">{d.project.name}</h1>
          <p className="mt-1 text-muted">Daily report · <span className="num font-semibold text-text">{formatDate(d.reportDate)}</span> · {d.weather ? WEATHER_LABEL[d.weather] : "weather not given"}{d.noWork ? " · no work today" : ""}</p>
          <p className="text-sm text-muted">
            Filed by {d.submittedByName ?? d.createdByName}{d.submittedAt ? ` · ${formatDateTime(d.submittedAt)}` : ""}
            {d.approvedByName ? ` · approved by ${d.approvedByName}${d.approvedAt ? ` ${formatDateTime(d.approvedAt)}` : ""}` : ""}
          </p>
        </div>
        <DprStatusChip status={d.status} />
      </header>

      {d.status === "REJECTED" && d.rejectionReason && (
        <Card className="border-danger"><p className="font-semibold">Sent back to the engineer</p><p className="mt-1">{d.rejectionReason}</p></Card>
      )}

      {decide && d.shortages.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-xl border-2 border-warn p-4">
          <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="font-semibold">Approval will be blocked by stock</p>
            <ul className="mt-1 list-disc pl-5 text-[16px]">
              {d.shortages.map((s) => <li key={s.materialId}>{s.name}: needs <span className="num">{s.needed} {s.unit}</span>, only <span className="num">{s.available} {s.unit}</span> in stock</li>)}
            </ul>
            <p className="mt-1 text-sm text-muted">Record a receipt or send the report back so the engineer corrects the quantity.</p>
          </div>
        </div>
      )}
      {decide && <ApproveControls dprId={d.id} effects={effects} nextHref={next ? `/progress/${next.id}` : null} />}

      <Card>
        <h2 className="mb-2 text-lg">Work done</h2>
        {d.progress.length === 0 ? <p className="text-muted">No quantities in this report.</p> : (
          <ul className="divide-y divide-border">
            {d.progress.map((p) => {
              const pct = Math.min(100, Math.round((p.cumulativeQty / p.plannedQty) * 100));
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/projects/${d.projectId}/planning/activities/${p.activityId}`} className="font-medium hover:underline">{p.name}</Link>
                    <span className="num text-[17px] font-semibold">{p.quantity} {p.unit}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${pct} percent of planned quantity ${d.status === "APPROVED" ? "done" : "done if approved"}`}>
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="num mt-1 text-sm text-muted">{p.cumulativeQty} of {p.plannedQty} {p.unit} {d.status === "APPROVED" ? "done" : "done if approved"} ({pct}%)</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex items-baseline justify-between"><h2 className="text-lg">Labour</h2><span className="num text-sm text-muted">{Math.round(totalMandays * 10) / 10} mandays{showCost ? ` · ${formatInr(labourCost)}` : ""}</span></div>
        {d.labour.length === 0 ? <p className="text-muted">No labour recorded.</p> : (
          <ul className="divide-y divide-border text-[15px]">
            {d.labour.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span><span className="font-medium">{l.trade}</span> · {SOURCE_LABEL[l.source]}{l.subcontractor ? ` (${l.subcontractor})` : ""}{l.activity ? <span className="text-muted"> · {l.activity}</span> : null}</span>
                <span className="num text-muted">{l.headcount} × {l.hours} h = {l.mandays} md{l.dailyLabourCost !== undefined ? ` · ${formatInr(l.dailyLabourCost)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {d.materials.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Material used</h2>
          <ul className="divide-y divide-border text-[15px]">
            {d.materials.map((m) => <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium">{m.material}</span><span className="text-muted"> · {m.activity}</span></span><span className="num font-semibold">{m.quantity} {m.unit}</span></li>)}
          </ul>
        </Card>
      )}

      {d.photos.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Photos</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {d.photos.map((p) => (
              <li key={p.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={`/api/files/dpr-photo/${p.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/dpr-photo/${p.id}`} alt={p.name} className="aspect-square w-full rounded-lg object-cover" loading="lazy" /></a>
                {canShare && (
                  <ActionButton
                    variant="ghost" className="w-full text-sm"
                    label={<>{p.clientVisible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />} {p.clientVisible ? "Hide from client" : "Show to client"}</>}
                    action={setPhotoVisibleAction.bind(null, p.id, !p.clientVisible)} successMessage={p.clientVisible ? "Hidden from the client." : "Shared with the client."}
                  />
                )}
              </li>
            ))}
          </ul>
          {canShare && <p className="mt-2 text-sm text-muted">Clients only see photos you share, and only once the report is approved.</p>}
        </Card>
      )}

      {d.issues.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Issues raised</h2>
          <ul className="space-y-1 text-[15px]">{d.issues.map((i) => <li key={i.id}><span className="code text-muted">{i.code}</span> <span className="font-semibold">{SEVERITY_LABEL[i.severity]}</span> · {i.title}</li>)}</ul>
        </Card>
      )}
      {d.remarks && <Card><h2 className="mb-1 text-lg">Remarks</h2><p>{d.remarks}</p></Card>}
    </div>
  );
}
