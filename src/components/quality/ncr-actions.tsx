"use client";

import { correctiveActionAction, reinspectionAction, requestReinspectionAction, rectificationAction, reworkCostAction } from "@/actions/quality";
import { ActionButton } from "@/components/forms/action-button";
import { ModalForm } from "@/components/forms/modal-form";
import type { NcrStatus } from "@prisma/client";

const n = (s: string | undefined) => (s === undefined || s.trim() === "" ? undefined : Number(s.replace(/,/g, "")));

/** The next step for an NCR, as buttons. Only shown to roles that may move it (the service checks again). */
export function NcrStepActions({ ncrId, status }: { ncrId: string; status: NcrStatus }) {
  if (status === "OPEN") {
    return (
      <ModalForm title="Corrective action" label="Agree corrective action" icon="none" size="lg" submitLabel="Save corrective action" successMessage="Corrective action recorded."
        fields={[{ name: "action", label: "What will be done to fix it, and by whom?", type: "textarea", required: true }]}
        action={(v) => correctiveActionAction(ncrId, { action: v.action })} />
    );
  }
  if (status === "CORRECTIVE_ACTION") {
    return (
      <ModalForm title="Record the rectification" label="Record rectification" icon="none" size="lg" submitLabel="Save rectification" successMessage="Rectification recorded."
        fields={[
          { name: "note", label: "What was done to fix it?", type: "textarea", required: true },
          { name: "timeLostDays", label: "Time lost", type: "number", required: true, unit: "days", default: "0" },
        ]}
        action={(v) => rectificationAction(ncrId, { note: v.note, timeLostDays: n(v.timeLostDays) })} />
    );
  }
  if (status === "RECTIFICATION") {
    return (
      <div className="flex flex-wrap gap-2">
        <ActionButton size="lg" label="Request reinspection" successMessage="Reinspection requested." action={() => requestReinspectionAction(ncrId)} />
        <ModalForm title="Record more rework" label="Record more rework" icon="none" variant="secondary" size="lg" submitLabel="Save rework" successMessage="Rework recorded."
          fields={[
            { name: "note", label: "What more was done to fix it?", type: "textarea", required: true },
            { name: "timeLostDays", label: "More time lost", type: "number", required: true, unit: "days", default: "0" },
          ]}
          action={(v) => rectificationAction(ncrId, { note: v.note, timeLostDays: n(v.timeLostDays) })} />
      </div>
    );
  }
  if (status === "REINSPECTION") {
    return (
      <div className="flex flex-wrap gap-2">
        <ActionButton size="lg" label="Reinspection passed — close" confirm="Close this NCR? The closure time will be recorded." successMessage="NCR closed." action={() => reinspectionAction(ncrId, { passed: true })} />
        <ModalForm title="Reinspection failed" label="Failed — send back" icon="none" variant="secondary" size="lg" submitLabel="Send back for rework" successMessage="Sent back for more rework."
          fields={[{ name: "note", label: "What is still wrong?", type: "textarea", required: true }]}
          action={(v) => reinspectionAction(ncrId, { passed: false, note: v.note })} />
      </div>
    );
  }
  return null;
}

/** Rework cost is cost data: this form only exists for the Owner and the PM of the project. */
export function ReworkCostButton({ ncrId, labour, material }: { ncrId: string; labour?: number; material?: number }) {
  return (
    <ModalForm title="Rework cost" label="Record rework cost" icon="none" variant="secondary" submitLabel="Save cost" successMessage="Rework cost saved."
      fields={[
        { name: "labour", label: "Rework labour cost", type: "number", required: true, unit: "₹", default: labour ? String(labour) : "0" },
        { name: "material", label: "Rework material cost", type: "number", required: true, unit: "₹", default: material ? String(material) : "0" },
      ]}
      action={(v) => reworkCostAction(ncrId, { labour: n(v.labour), material: n(v.material) })} />
  );
}
