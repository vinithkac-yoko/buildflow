import { notFound } from "next/navigation";
import { engineerReport } from "@/core/dpr/queries";
import { can } from "@/core/auth/permissions";
import { AppError } from "@/core/errors";
import { DprForm } from "@/components/dpr/dpr-form";
import { DprSubmitted } from "@/components/dpr/dpr-submitted";
import { NoAccess } from "@/components/no-access";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Daily report" };

export default async function DprPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { ctx } = await requireSession();
  if (!can(ctx, "create", "dpr", projectId)) {
    if (can(ctx, "read", "dpr", projectId)) return <NoAccess message="Daily reports are filed by the site team. You can review them under Progress." />;
    notFound();
  }
  let report;
  try {
    report = await engineerReport(ctx, projectId);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const status = report.dpr?.status;
  if (status === "SUBMITTED" || status === "APPROVED") return <DprSubmitted report={report} />;
  // Key on the report so a fresh server state (after reject, after submit) resets the form.
  return <DprForm key={`${report.dpr?.id ?? "new"}:${status ?? "none"}`} report={report} />;
}
