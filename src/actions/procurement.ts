"use server";

import { toResult } from "@/core/common";
import { adjustStock, issueStock, returnStock, transferStock } from "@/core/inventory/operations";
import { createInvoice, recordPayment } from "@/core/procurement/payables";
import { addQuotation, cancelPurchaseRequest, createPurchaseOrder, removeQuotation, selectQuotation } from "@/core/procurement/orders";
import { cancelPurchaseOrder } from "@/core/procurement/purchase-orders";
import { recordReceipt } from "@/core/procurement/receipts";
import { cancelMaterialRequest, convertToPurchaseRequest, createMaterialRequest, rejectMaterialRequest } from "@/core/procurement/requests";
import { requireSession } from "@/lib/auth";

export async function createMaterialRequestAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => createMaterialRequest(ctx, projectId, payload), "request");
}
export async function convertRequestAction(mrId: string) {
  const { ctx } = await requireSession();
  return toResult(() => convertToPurchaseRequest(ctx, mrId), "request");
}
export async function rejectRequestAction(mrId: string, reason: string) {
  const { ctx } = await requireSession();
  return toResult(() => rejectMaterialRequest(ctx, mrId, reason), "request");
}
export async function cancelRequestAction(mrId: string) {
  const { ctx } = await requireSession();
  return toResult(() => cancelMaterialRequest(ctx, mrId), "request");
}

export async function addQuotationAction(prId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => addQuotation(ctx, prId, payload), "quotation");
}
export async function removeQuotationAction(quotationId: string) {
  const { ctx } = await requireSession();
  return toResult(() => removeQuotation(ctx, quotationId), "quotation");
}
export async function selectQuotationAction(quotationId: string) {
  const { ctx } = await requireSession();
  return toResult(() => selectQuotation(ctx, quotationId), "quotation");
}
export async function createPurchaseOrderAction(prId: string, payload: unknown = {}) {
  const { ctx } = await requireSession();
  return toResult(() => createPurchaseOrder(ctx, prId, payload), "purchase order");
}
export async function cancelPurchaseRequestAction(prId: string) {
  const { ctx } = await requireSession();
  return toResult(() => cancelPurchaseRequest(ctx, prId), "purchase request");
}
export async function cancelPurchaseOrderAction(poId: string, reason: string) {
  const { ctx } = await requireSession();
  return toResult(() => cancelPurchaseOrder(ctx, poId, reason), "purchase order");
}

export async function recordReceiptAction(orderId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => recordReceipt(ctx, orderId, payload), "receipt");
}
export async function createInvoiceAction(orderId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => createInvoice(ctx, orderId, payload), "invoice");
}
export async function recordPaymentAction(invoiceId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => recordPayment(ctx, invoiceId, payload), "payment");
}

export async function issueStockAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => issueStock(ctx, projectId, payload), "issue");
}
export async function returnStockAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => returnStock(ctx, projectId, payload), "return");
}
export async function transferStockAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => transferStock(ctx, projectId, payload), "transfer");
}
export async function adjustStockAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => adjustStock(ctx, projectId, payload), "adjustment");
}
