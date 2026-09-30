"use server";

import { toResult } from "@/core/common";
import { endDelay, recordDelay } from "@/core/delays/service";
import { decideDocument, type DocAction } from "@/core/documents/service";
import { assignEquipment, backInService, logEquipment, releaseEquipment } from "@/core/equipment/service";
import { setIssueTarget } from "@/core/issues/service";
import { cancelWorkOrder, createSubBill, createWorkOrder, recordMeasurement, recordSubPayment } from "@/core/subcontract/service";
import { requireSession } from "@/lib/auth";

export async function setIssueTargetAction(issueId: string, date: string | null) {
  const { ctx } = await requireSession();
  return toResult(() => setIssueTarget(ctx, issueId, date || null), "issue");
}

export async function recordDelayAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => recordDelay(ctx, projectId, payload), "delay");
}
export async function endDelayAction(delayId: string, endDate: string) {
  const { ctx } = await requireSession();
  return toResult(() => endDelay(ctx, delayId, endDate), "delay");
}

export async function assignEquipmentAction(equipmentId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => assignEquipment(ctx, equipmentId, payload), "equipment");
}
export async function releaseEquipmentAction(equipmentId: string) {
  const { ctx } = await requireSession();
  return toResult(() => releaseEquipment(ctx, equipmentId), "equipment");
}
export async function logEquipmentAction(equipmentId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => logEquipment(ctx, equipmentId, payload), "equipment log");
}
export async function backInServiceAction(equipmentId: string) {
  const { ctx } = await requireSession();
  return toResult(() => backInService(ctx, equipmentId), "equipment");
}

export async function decideDocumentAction(documentId: string, action: DocAction, reason?: string) {
  const { ctx } = await requireSession();
  return toResult(() => decideDocument(ctx, documentId, action, reason), "document");
}

export async function createWorkOrderAction(projectId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => createWorkOrder(ctx, projectId, payload), "work order");
}
export async function recordMeasurementAction(workOrderId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => recordMeasurement(ctx, workOrderId, payload), "measurement");
}
export async function cancelWorkOrderAction(workOrderId: string, reason: string) {
  const { ctx } = await requireSession();
  return toResult(() => cancelWorkOrder(ctx, workOrderId, reason), "work order");
}
export async function createSubBillAction(workOrderId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => createSubBill(ctx, workOrderId, payload), "bill");
}
export async function recordSubPaymentAction(billId: string, payload: unknown) {
  const { ctx } = await requireSession();
  return toResult(() => recordSubPayment(ctx, billId, payload), "payment");
}
