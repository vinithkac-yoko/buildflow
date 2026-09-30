import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/core/errors";
import { NEXT_STEP } from "@/core/quality/calc";
import { getNcr } from "@/core/quality/ncr";
import { NcrStepActions, ReworkCostButton } from "@/components/quality/ncr-actions";
import { NcrStatusChip, SeverityChip, STEP_LABEL } from "@/components/quality/status";
import { inr } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "NCR" };

export default async function NcrDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let n;
  try { n = await getNcr(ctx, id); } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") return <NoAccess />;
    throw e;
  }
  const showCost = n.reworkLabourCost !== undefined;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/ncr" className="text-[15px] text-muted hover:text-text">← NCRs</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl md:text-3xl"><span className="code">{n.code}</span></h1><span className="flex gap-2"><SeverityChip severity={n.severity} /><NcrStatusChip status={n.status} /></span></div>
        <p className="text-muted">{n.projectCode} {n.projectName}{n.activity ? ` · ${n.activity}` : ""}{n.subcontractor ? ` · subcontractor ${n.subcontractor}` : ""}</p>
      </div>

      <Card>
        <h2 className="mb-1 text-lg">Defect</h2>
        <p className="text-[17px]">{n.defect}</p>
        {n.inspection && <p className="mt-2 text-sm text-muted">From <Link className="underline" href={`/inspections/${n.inspection.id}`}>{n.inspection.code}</Link> — {n.inspection.passedCheckpoints} of {n.inspection.totalCheckpoints} checkpoints passed.</p>}
      </Card>

      {n.status !== "CLOSED" && (
        <Card>
          <p className="text-sm text-muted">Next step</p>
          <p className="mb-3 text-[18px] font-semibold">{NEXT_STEP[n.status]}</p>
          <div className="flex flex-wrap gap-2">
            {n.canStep && <NcrStepActions ncrId={n.id} status={n.status} />}
            {n.canCost && <ReworkCostButton ncrId={n.id} labour={n.reworkLabourCost} material={n.reworkMaterialCost} />}
          </div>
          {!n.canStep && !n.canCost && <p className="text-sm text-muted">The Quality Engineer moves this NCR forward.</p>}
        </Card>
      )}
      {n.status === "CLOSED" && n.canCost && <div><ReworkCostButton ncrId={n.id} labour={n.reworkLabourCost} material={n.reworkMaterialCost} /></div>}

      <Card>
        <h2 className="mb-2 text-lg">Fix</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div><dt className="text-sm text-muted">Corrective action</dt><dd>{n.correctiveAction ?? "—"}</dd></div>
          <div><dt className="text-sm text-muted">Rectification</dt><dd>{n.rectificationNote ?? "—"}</dd></div>
          <div><dt className="text-sm text-muted">Time lost</dt><dd className="num">{n.timeLostDays} day{n.timeLostDays === 1 ? "" : "s"}</dd></div>
          <div><dt className="text-sm text-muted">Closure time</dt><dd className="num">{n.closedAt ? `${n.closureHours} hours` : "Open"}</dd></div>
          {showCost && <div><dt className="text-sm text-muted">Rework labour cost</dt><dd className="num">{inr(n.reworkLabourCost)}</dd></div>}
          {showCost && <div><dt className="text-sm text-muted">Rework material cost</dt><dd className="num">{inr(n.reworkMaterialCost)}</dd></div>}
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg">Timeline</h2>
        <ol className="space-y-3">
          {n.actions.map((a) => (
            <li key={a.id}><p className="font-medium">{STEP_LABEL[a.step] ?? a.step}</p>{a.note && <p className="text-[16px]">{a.note}</p>}<p className="text-sm text-muted">{a.by} · {formatDateTime(a.at)}</p></li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
