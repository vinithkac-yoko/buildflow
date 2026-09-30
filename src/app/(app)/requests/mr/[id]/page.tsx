import Link from "next/link";
import { notFound } from "next/navigation";
import { convertRequestAction, cancelRequestAction } from "@/actions/procurement";
import { ActionButton } from "@/components/forms/action-button";
import { ReasonButton } from "@/components/procurement/office-actions";
import { MrChip, fmtDate, qty } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { can } from "@/core/auth/permissions";
import { AppError } from "@/core/errors";
import { getMaterialRequest } from "@/core/procurement/requests";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Material request" };

export default async function MrDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let mr;
  try { mr = await getMaterialRequest(ctx, id); } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") return <NoAccess />;
    throw e;
  }
  const canOpenPr = mr.purchaseRequest && can(ctx, "read", "purchase_request", mr.projectId);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/requests" className="text-[15px] text-muted hover:text-text">← Requests</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl md:text-3xl"><span className="code">{mr.code}</span></h1>
          <MrChip status={mr.status} />
        </div>
        <p className="text-muted">{mr.projectCode} {mr.projectName} · requested by {mr.requestedBy}{mr.neededBy ? ` · needed by ${fmtDate(mr.neededBy)}` : ""}</p>
      </div>

      <Card>
        <h2 className="mb-2 text-lg">Material</h2>
        <ul className="divide-y divide-border">
          {mr.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <div>
                <div className="text-[17px] font-semibold">{i.material}</div>
                <div className="text-sm text-muted">{i.activity ? `For ${i.activity}` : "No activity chosen"} · in stock now {qty(i.inStock)} {i.unit}</div>
              </div>
              <div className="num text-[22px] font-semibold">{qty(i.quantity)} <span className="text-base text-muted">{i.unit}</span></div>
            </li>
          ))}
        </ul>
        {mr.note && <p className="mt-3 text-[16px]"><span className="text-muted">Note: </span>{mr.note}</p>}
      </Card>

      {mr.status === "REJECTED" && <Card><p className="font-medium">Not approved{mr.decidedBy ? ` by ${mr.decidedBy}` : ""}.</p>{mr.rejectionReason && <p className="mt-1">{mr.rejectionReason}</p>}</Card>}
      {mr.status === "CONVERTED" && mr.purchaseRequest && (
        <Card><p>Sent to purchase as {canOpenPr ? <Link className="font-semibold underline" href={`/requests/pr/${mr.purchaseRequest.id}`}>{mr.purchaseRequest.code}</Link> : <strong>{mr.purchaseRequest.code}</strong>}.</p></Card>
      )}

      {mr.status === "SUBMITTED" && (
        <div className="flex flex-wrap gap-2">
          {mr.canDecide && (
            <>
              <ActionButton size="lg" variant="primary" label="Send to purchase" successMessage="Sent to purchase." action={convertRequestAction.bind(null, mr.id)} />
              <ReasonButton kind="rejectMr" id={mr.id} label="Send back" title="Send the request back" />
            </>
          )}
          {mr.canCancel && <ActionButton variant="secondary" size="lg" label="Cancel request" confirm="Cancel this request?" successMessage="Request cancelled." action={cancelRequestAction.bind(null, mr.id)} />}
        </div>
      )}
    </div>
  );
}
