import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelPurchaseRequestAction, createPurchaseOrderAction, removeQuotationAction, selectQuotationAction } from "@/actions/procurement";
import { ActionButton } from "@/components/forms/action-button";
import { QuotationButton } from "@/components/procurement/office-actions";
import { PrChip, QuoteChip, fmtDate, inr, qty } from "@/components/procurement/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { can } from "@/core/auth/permissions";
import { AppError } from "@/core/errors";
import { getPurchaseRequest } from "@/core/procurement/orders";
import { vendorOptions } from "@/core/procurement/options";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Purchase request" };

export default async function PrDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let pr;
  try { pr = await getPurchaseRequest(ctx, id); } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    if (e instanceof AppError && e.code === "FORBIDDEN") return <NoAccess />;
    throw e;
  }
  const vendors = pr.canQuote ? await vendorOptions(ctx) : [];
  const quotedVendorIds = new Set(pr.quotations.map((q) => q.vendorId));
  const showRates = pr.quotations.some((q) => q.poTotal !== undefined);
  const lowest = showRates ? Math.min(...pr.quotations.map((q) => q.poTotal ?? Infinity)) : null;
  const chosen = pr.quotations.find((q) => q.status === "SELECTED");
  const enough = pr.quotations.length >= 2;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link href="/requests?tab=pr" className="text-[15px] text-muted hover:text-text">← Purchase requests</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl md:text-3xl"><span className="code">{pr.code}</span></h1>
          <PrChip status={pr.status} />
        </div>
        <p className="text-muted">
          {pr.projectCode} {pr.projectName} · raised by {pr.raisedBy}{pr.neededBy ? ` · needed by ${fmtDate(pr.neededBy)}` : ""}
          {pr.materialRequest && can(ctx, "read", "material_request", pr.projectId) && <> · from <Link className="underline" href={`/requests/mr/${pr.materialRequest.id}`}>{pr.materialRequest.code}</Link> ({pr.materialRequest.requestedBy.name})</>}
        </p>
      </div>

      <Card>
        <h2 className="mb-2 text-lg">To buy</h2>
        <ul className="divide-y divide-border">
          {pr.items.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-2 py-2.5">
              <span className="text-[17px] font-semibold">{i.material}</span>
              <span className="num text-[20px] font-semibold">{qty(i.quantity)} <span className="text-base text-muted">{i.unit}</span></span>
            </li>
          ))}
        </ul>
      </Card>

      {pr.activeOrder && (
        <Card className="flex flex-wrap items-center justify-between gap-2">
          <p>Order <strong>{pr.activeOrder.code}</strong> has been raised for this request.</p>
          {can(ctx, "read", "purchase_order", pr.projectId) && <Link href={`/purchase-orders/${pr.activeOrder.id}`} className="font-semibold underline">Open the order</Link>}
        </Card>
      )}

      <section aria-labelledby="quotes" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="quotes" className="text-xl">Quotations <span className="text-muted">({pr.quotations.length})</span></h2>
          {pr.canQuote && <QuotationButton prId={pr.id} vendors={vendors.filter((v) => !quotedVendorIds.has(v.value))} items={pr.items.map((i) => ({ id: i.id, material: i.material, unit: i.unit, quantity: i.quantity }))} />}
        </div>
        {pr.status === "OPEN" && !enough && <p className="text-[15px] text-muted">Add at least 2 vendor quotations so the prices can be compared, then choose one.</p>}

        {pr.quotations.length === 0 ? (
          <Card><p className="text-muted">No quotations yet.</p></Card>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {pr.quotations.map((q) => (
              <li key={q.id} className={`panel p-4 ${q.status === "SELECTED" ? "border-2 border-brand" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-[18px] font-semibold">{q.vendor}</div>
                    <div className="text-sm text-muted"><span className="code">{q.code}</span> · {q.vendorCategory}</div>
                  </div>
                  <QuoteChip status={q.status} />
                </div>
                {showRates && (
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="num text-[26px] font-semibold">{inr(q.poTotal)}</span>
                    <span className="text-sm text-muted">incl. tax</span>
                    {q.poTotal === lowest && pr.quotations.length > 1 && <span className="rounded-full border border-brand-text/40 px-2 py-0.5 text-xs font-semibold text-brand-text">Lowest</span>}
                  </div>
                )}
                {showRates && (
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {q.lines.map((l) => {
                      const it = pr.items.find((x) => x.id === l.prItemId);
                      return <li key={l.prItemId} className="flex justify-between gap-2"><span>{it?.material}</span><span className="num text-muted">{inr(l.unitRate)} / {it?.unit} · GST {l.taxPct}%</span></li>;
                    })}
                  </ul>
                )}
                <p className="mt-2 text-sm text-muted">{q.deliveryDays !== null ? `Delivery in ${q.deliveryDays} days` : "Delivery time not given"}{q.paymentTerms ? ` · ${q.paymentTerms}` : ""}{q.quoteRef ? ` · ref ${q.quoteRef}` : ""}</p>
                {pr.status === "OPEN" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pr.canSelect && q.status !== "SELECTED" && (
                      enough
                        ? <ActionButton size="lg" label="Choose this vendor" successMessage="Vendor chosen." action={selectQuotationAction.bind(null, q.id)} />
                        : null
                    )}
                    {pr.canSelect && <ActionButton variant="ghost" label="Remove" confirm={`Remove ${q.vendor}'s quotation?`} successMessage="Quotation removed." action={removeQuotationAction.bind(null, q.id)} />}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pr.status === "OPEN" && (
        <div className="flex flex-wrap gap-2">
          {pr.canOrder && chosen && <ActionButton size="lg" variant="primary" label={`Raise purchase order — ${chosen.vendor}`} successMessage="Purchase order raised." action={createPurchaseOrderAction.bind(null, pr.id, {})} />}
          {pr.canOrder && !chosen && <p className="text-[15px] text-muted">Choose a vendor to raise the purchase order.</p>}
          {pr.canCancel && <ActionButton variant="ghost" label="Cancel request" confirm="Cancel this purchase request?" successMessage="Purchase request cancelled." action={cancelPurchaseRequestAction.bind(null, pr.id)} />}
        </div>
      )}
    </div>
  );
}
