import { z } from "zod";

const num = (label: string) => z.number({ invalid_type_error: `${label} must be a number.`, required_error: `Enter ${label}.` }).finite(`${label} must be a number.`);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullish();

export const mrItem = z.object({
  materialId: z.string().min(1, "Pick a material."),
  quantity: num("the quantity").gt(0, "Quantity must be more than 0."),
  activityId: z.string().min(1).nullish(),
});
export const materialRequestInput = z.object({
  neededBy: opt(dateStr),
  note: z.string().trim().max(500, "Keep the note short.").nullish(),
  items: z.array(mrItem).min(1, "Add at least one material.").max(40, "Too many lines in one request."),
  clientTxnId: z.string().min(8).max(64).nullish(),
});
export type MaterialRequestInput = z.infer<typeof materialRequestInput>;

export const quotationInput = z.object({
  vendorId: z.string().min(1, "Pick the vendor."),
  quoteRef: z.string().trim().max(60).nullish(),
  quotedOn: opt(dateStr),
  validUntil: opt(dateStr),
  deliveryDays: opt(num("delivery days").int("Delivery days must be a whole number.").min(0).max(365)),
  paymentTerms: z.string().trim().max(200).nullish(),
  items: z.array(z.object({
    prItemId: z.string().min(1),
    unitRate: num("the rate").min(0, "Rate can't be negative."),
    taxPct: num("the tax %").min(0, "Tax can't be negative.").max(100, "Tax can't be more than 100%."),
  })).min(1, "Enter a rate for every material."),
});
export type QuotationInput = z.infer<typeof quotationInput>;

export const poInput = z.object({
  expectedDate: opt(dateStr),
  terms: z.string().trim().max(500).nullish(),
});

export const receiptInput = z.object({
  storageLocationId: z.string().min(1, "Pick where the material was stored."),
  receivedOn: opt(dateStr),
  challanNo: z.string().trim().max(60).nullish(),
  note: z.string().trim().max(500).nullish(),
  items: z.array(z.object({
    poItemId: z.string().min(1),
    quantity: num("the quantity received").gt(0, "Quantity must be more than 0."),
  })).min(1, "Enter a quantity for at least one material."),
  clientTxnId: z.string().min(8).max(64).nullish(),
});
export type ReceiptInput = z.infer<typeof receiptInput>;

export const invoiceInput = z.object({
  invoiceNo: z.string().trim().min(1, "Enter the vendor's invoice number.").max(60),
  invoiceDate: dateStr,
  dueDate: opt(dateStr),
  subtotal: num("the amount before tax").min(0, "Amount can't be negative."),
  tax: num("the tax amount").min(0, "Tax can't be negative."),
});

export const PAYMENT_MODES = ["BANK_TRANSFER", "CHEQUE", "UPI", "CASH"] as const;
export const PAYMENT_MODE_LABEL: Record<(typeof PAYMENT_MODES)[number], string> = {
  BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", UPI: "UPI", CASH: "Cash",
};
export const paymentInput = z.object({
  amount: num("the amount").gt(0, "Amount must be more than 0."),
  paidOn: opt(dateStr),
  mode: z.enum(PAYMENT_MODES, { errorMap: () => ({ message: "Pick how it was paid." }) }),
  reference: z.string().trim().max(80).nullish(),
});

export const stockIssueInput = z.object({
  materialId: z.string().min(1, "Pick a material."),
  quantity: num("the quantity").gt(0, "Quantity must be more than 0."),
  activityId: z.string().min(1, "Pick the activity it was issued to."),
  storageLocationId: z.string().min(1).nullish(),
  note: z.string().trim().max(200).nullish(),
  clientTxnId: z.string().min(8).max(64).nullish(),
});
export const stockReturnInput = z.object({
  materialId: z.string().min(1, "Pick a material."),
  quantity: num("the quantity").gt(0, "Quantity must be more than 0."),
  activityId: z.string().min(1).nullish(),
  storageLocationId: z.string().min(1, "Pick where it goes back."),
  note: z.string().trim().max(200).nullish(),
});
export const stockTransferInput = z.object({
  materialId: z.string().min(1, "Pick a material."),
  quantity: num("the quantity").gt(0, "Quantity must be more than 0."),
  fromLocationId: z.string().min(1, "Pick where it comes from."),
  toProjectId: z.string().min(1, "Pick the destination project."),
  toLocationId: z.string().min(1, "Pick where it goes."),
  note: z.string().trim().max(200).nullish(),
});
export const ADJUST_KINDS = ["WASTAGE", "THEFT_LOSS", "GAIN"] as const;
export const stockAdjustInput = z.object({
  materialId: z.string().min(1, "Pick a material."),
  storageLocationId: z.string().min(1, "Pick the location."),
  kind: z.enum(ADJUST_KINDS, { errorMap: () => ({ message: "Pick what happened." }) }),
  quantity: num("the quantity").gt(0, "Quantity must be more than 0."),
  note: z.string().trim().min(3, "Say what was found (a few words).").max(200),
});
