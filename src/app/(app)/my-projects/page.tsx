import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { listProjects } from "@/core/projects/service";
import { DemoBadge } from "@/components/status-chip";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "My Projects" };

export default async function MyProjectsPage() {
  const { ctx } = await requireSession();
  const projects = await listProjects(ctx);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl">My Projects</h1>
      {projects.length === 0 ? (
        <Card>
          <p className="text-[17px] font-medium">No projects assigned yet.</p>
          <p className="text-muted">Ask your Project Manager to add you to a site.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="panel flex min-h-20 items-center gap-3 p-4 hover:bg-surface-2 transition-colors duration-fast"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="code text-sm text-muted">{p.code}</span>
                    {p.isDemo && <DemoBadge />}
                  </div>
                  <div className="text-[18px] font-semibold leading-snug">{p.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[15px] text-muted">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{p.location}</span>
                  </div>
                </div>
                <ChevronRight className="h-6 w-6 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
