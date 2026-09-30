import { can } from "@/core/auth/permissions";
import { inspectionFormData } from "@/core/quality/inspections";
import { InspectionRequestForm } from "@/components/quality/inspection-forms";
import { NoAccess } from "@/components/no-access";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Request an inspection" };

export default async function RequestInspectionPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "create", "inspection")) return <NoAccess />;
  return <InspectionRequestForm data={await inspectionFormData(ctx)} />;
}
