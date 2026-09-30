import { redirect } from "next/navigation";
import { can } from "@/core/auth/permissions";
import { getInspection, inspectionFormData } from "@/core/quality/inspections";
import { InspectionForm, type InspectionPreset } from "@/components/quality/inspection-forms";
import { NoAccess } from "@/components/no-access";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Inspection" };

export default async function NewInspectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "update", "inspection")) return <NoAccess message="Only the Quality Engineer completes inspections." />;
  const sp = await searchParams;
  const requestId = Array.isArray(sp.request) ? sp.request[0] : sp.request;
  const data = await inspectionFormData(ctx);
  let preset: InspectionPreset = {};
  if (requestId) {
    const req = await getInspection(ctx, requestId).catch(() => null);
    if (!req || req.status !== "REQUESTED") redirect(req ? `/inspections/${req.id}` : "/inspections");
    const checklist = data.checklists.find((c) => c.name === req.checklist);
    preset = { requestId, projectId: req.projectId, activityId: req.activityId, checklistId: checklist?.id, requestNote: req.requestNote, requestedBy: req.requestedBy };
  }
  return <InspectionForm data={data} preset={preset} />;
}
