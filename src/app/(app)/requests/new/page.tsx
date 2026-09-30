import { can } from "@/core/auth/permissions";
import { requestFormData } from "@/core/procurement/options";
import { NoAccess } from "@/components/no-access";
import { MaterialRequestForm } from "@/components/procurement/material-request-form";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Request material" };

export default async function NewRequestPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "create", "material_request")) return <NoAccess message="Only site engineers raise material requests." />;
  const projects = await requestFormData(ctx);
  return <MaterialRequestForm projects={projects} />;
}
