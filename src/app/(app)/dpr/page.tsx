import { redirect } from "next/navigation";
import { can } from "@/core/auth/permissions";
import { listProjects } from "@/core/projects/service";
import { NoAccess } from "@/components/no-access";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Daily report" };

export default async function DprIndex() {
  const { ctx, user } = await requireSession();
  if (!can(ctx, "create", "dpr")) {
    if (can(ctx, "read", "dpr")) redirect("/progress");
    return <NoAccess />;
  }
  const projects = (await listProjects(ctx)).filter((p) => p.status === "ACTIVE" || p.status === "DELAYED");
  if (projects.length === 1) redirect(`/dpr/${projects[0].id}`);
  if (projects.length === 0 && user.role === "SITE_ENGINEER") redirect("/my-projects");
  redirect("/my-projects"); // several projects: pick one on My Projects
}
