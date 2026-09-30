import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { AppError } from "@/core/errors";
import { getInspection } from "@/core/quality/inspections";
import { ResultChip } from "@/components/quality/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Inspection" };

export default async function InspectionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let i;
  try { i = await getInspection(ctx, id); } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") return <NoAccess />;
    throw e;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/quality" className="text-[15px] text-muted hover:text-text">← Quality</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl md:text-3xl"><span className="code">{i.code}</span></h1><ResultChip result={i.result} /></div>
        <p className="text-muted">{i.projectCode} {i.projectName} · {i.activity} · {i.checklist}</p>
        <p className="text-muted">{i.status === "COMPLETED" ? `Inspected ${i.date ? formatDate(i.date) : ""} by ${i.inspector ?? "—"}` : `Requested by ${i.requestedBy ?? "—"}`}{i.subcontractor ? ` · subcontractor ${i.subcontractor}` : ""}</p>
      </div>
      {i.status === "REQUESTED" && (
        <Card>
          <p>{i.requestNote ? `“${i.requestNote}”` : "Waiting for the Quality Engineer."}</p>
          {i.canComplete && <Link href={`/inspections/new?request=${i.id}`} className="mt-3 inline-flex min-h-14 items-center rounded-xl bg-brand px-5 text-[17px] font-semibold text-brand-on hover:brightness-110">Start inspection</Link>}
        </Card>
      )}
      {i.status === "COMPLETED" && (
        <>
          <Card>
            <p className="num text-[22px] font-semibold">{i.passed} of {i.total} checkpoints pass</p>
            {i.remarks && <p className="mt-1">{i.remarks}</p>}
            {i.ncr && <p className="mt-2">NCR raised: <Link className="font-semibold underline" href={`/ncr/${i.ncr.id}`}>{i.ncr.code}</Link></p>}
          </Card>
          <Card>
            <ol className="divide-y divide-border">
              {i.results.map((r) => (
                <li key={r.seq} className="flex items-start gap-3 py-2.5">
                  {r.passed ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-text" aria-label="Pass" /> : <X className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-label="Fail" />}
                  <div><p className="text-[16px]">{r.text}</p>{r.note && <p className="text-sm text-danger">{r.note}</p>}</div>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
