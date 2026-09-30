import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { listProjects } from "@/core/projects/service";
import { NoAccess } from "@/components/no-access";
import { DemoBadge, ProjectStatusChip } from "@/components/status-chip";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Planning" };

export default async function PlanningIndex() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "activity")) return <NoAccess />;
  const projects = await listProjects(ctx);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Planning</h1>
        <p className="text-muted">Pick a project to work on its WBS, activities and BOQ.</p>
      </div>
      {projects.length === 0 ? (
        <Card><p className="font-medium">No projects assigned to you yet.</p></Card>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}/planning`} className="panel flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="code text-xs text-muted">{p.code}</span>{p.isDemo && <DemoBadge />}</div>
                  <div className="truncate text-[17px] font-semibold">{p.name}</div>
                </div>
                <div className="flex items-center gap-2"><ProjectStatusChip status={p.status} /><ChevronRight className="h-5 w-5 text-muted" aria-hidden /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
