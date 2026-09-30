import type { InvoiceStatus, PoStatus, PrStatus, QuotationStatus, RequestStatus } from "@prisma/client";
import { Ban, CheckCircle2, CircleDashed, Clock, FileText, PackageCheck, PackageOpen, Send, Wallet, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatInr } from "@/lib/format";

type Tone = "ok" | "warn" | "danger" | "slate" | "plan";
const chip = (label: string, Icon: LucideIcon, tone: Tone) => (
  <Badge tone={tone}><Icon className="h-3.5 w-3.5" aria-hidden />{label}</Badge>
);

export const MrChip = ({ status }: { status: RequestStatus }) =>
  status === "SUBMITTED" ? chip("Waiting for PM", Clock, "warn")
    : status === "CONVERTED" ? chip("Sent to purchase", Send, "plan")
    : status === "REJECTED" ? chip("Not approved", Ban, "danger")
    : chip("Cancelled", Ban, "slate");

export const PrChip = ({ status }: { status: PrStatus }) =>
  status === "OPEN" ? chip("Getting quotations", FileText, "warn") : status === "ORDERED" ? chip("Ordered", CheckCircle2, "ok") : chip("Cancelled", Ban, "slate");

export const PoChip = ({ status }: { status: PoStatus }) =>
  status === "ISSUED" ? chip("Issued — awaiting delivery", Send, "plan")
    : status === "PARTIALLY_RECEIVED" ? chip("Part received", PackageOpen, "warn")
    : status === "RECEIVED" ? chip("Received", PackageCheck, "ok")
    : chip("Cancelled", Ban, "slate");

export const InvoiceChip = ({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) =>
  overdue ? chip("Overdue", Clock, "danger")
    : status === "PAID" ? chip("Paid", CheckCircle2, "ok")
    : status === "PARTIALLY_PAID" ? chip("Part paid", Wallet, "warn")
    : chip("Unpaid", CircleDashed, "slate");

export const QuoteChip = ({ status }: { status: QuotationStatus }) =>
  status === "SELECTED" ? chip("Chosen", CheckCircle2, "ok") : status === "NOT_SELECTED" ? chip("Not chosen", Ban, "slate") : chip("Received", FileText, "plan");

/** Money that may have been removed at the source for this role: shows a dash instead of a broken value. */
export const inr = (v: number | string | undefined | null) => (v === undefined || v === null ? "—" : formatInr(v));
export const qty = (n: number) => String(Math.round(n * 1000) / 1000);
export const fmtDate = formatDate;
