import type { Ctx } from "@/core/types";
import { canSeeField } from "@/core/auth/permissions";
import type { FieldDef } from "@/lib/forms";

export function activityFields(ctx: Ctx, projectId: string): FieldDef[] {
  const fields: FieldDef[] = [
    { name: "name", label: "Activity name", type: "text", required: true },
    { name: "wbsNodeId", label: "WBS item", type: "ref", required: true },
    { name: "tradeId", label: "Trade", type: "ref", ref: "trade" },
    { name: "uomId", label: "Unit", type: "ref", ref: "uom", required: true },
    { name: "costCodeId", label: "Cost code", type: "ref", ref: "costCode" },
    { name: "plannedQty", label: "Planned quantity", type: "number", required: true },
    { name: "plannedStart", label: "Planned start", type: "date", required: true },
    { name: "plannedFinish", label: "Planned finish", type: "date", required: true },
    { name: "plannedMandays", label: "Planned labour mandays", type: "number", required: true },
  ];
  if (canSeeField(ctx, "plannedCost", projectId)) {
    fields.push({ name: "plannedCost", label: "Planned cost", type: "number", unit: "₹", required: true });
  }
  fields.push(
    { name: "targetProductivity", label: "Target productivity", type: "number", hint: "Quantity per manday" },
    { name: "criticalPath", label: "On the critical path", type: "boolean" },
  );
  return fields;
}

export function boqFields(ctx: Ctx, projectId: string): FieldDef[] {
  const fields: FieldDef[] = [
    { name: "itemCode", label: "Item code", type: "text", required: true, hint: "e.g. B-027" },
    { name: "description", label: "Description", type: "text", required: true },
    { name: "uomId", label: "Unit", type: "ref", ref: "uom", required: true },
    { name: "originalQty", label: "Original quantity", type: "number", required: true },
    { name: "approvedVariationQty", label: "Approved variation quantity", type: "number", required: true, hint: "Use 0 if none. Negative for omissions." },
  ];
  if (canSeeField(ctx, "clientRate", projectId)) fields.push({ name: "clientRate", label: "Client rate", type: "number", unit: "₹", required: true });
  if (canSeeField(ctx, "budget", projectId)) fields.push({ name: "internalBudgetRate", label: "Internal budget rate", type: "number", unit: "₹", required: true });
  return fields;
}

export const BOM_FIELDS: FieldDef[] = [
  { name: "materialId", label: "Material", type: "ref", required: true },
  { name: "coefficient", label: "Coefficient", type: "number", required: true, hint: "Material quantity per unit of activity quantity" },
  { name: "wastagePct", label: "Allowable wastage", type: "number", unit: "%", required: true },
];
