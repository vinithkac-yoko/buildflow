import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { todayStatusByProject } from "@/core/dpr/queries";
import { listProjects } from "@/core/projects/service";
import { DemoBadge, DprStatusChip } from "@/components/status-chip";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "My Projects" };

export default async function MyProjectsPage() {
  const { ctx } = await requireSession();
  const projects = await listProjects(ctx);
  const status = await todayStatusByProject(ctx, projects.map((p) => p.id));

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
          {projects.map((p) => {
            const s = status.get(p.id);
            const active = p.status === "ACTIVE" || p.status === "DELAYED";
            const label = !active ? "Not open for reports" : !s ? "Start today’s report" : s.status === "DRAFT" || s.status === "REJECTED" ? "Continue today’s report" : "View today’s report";
            return (
              <li key={p.id} className="panel p-4">
                <Link href={`/projects/${p.id}`} className="flex items-start gap-3">
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
                  <ChevronRight className="mt-2 h-6 w-6 shrink-0 text-muted" aria-hidden />
                </Link>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="text-[15px] text-muted">Today:</span>
                  <DprStatusChip status={s?.status ?? null} />
                </div>
                {s?.status === "REJECTED" && s.rejectionReason && (
                  <p className="mt-2 rounded-lg border border-danger/60 px-3 py-2 text-[15px] text-danger">Your PM says: {s.rejectionReason}</p>
                )}
                {active ? (
                  <Link href={`/dpr/${p.id}`} className="mt-3 flex min-h-16 w-full items-center justify-center rounded-xl bg-brand text-[17px] font-bold text-brand-on hover:brightness-110">
                    {label}
                  </Link>
                ) : (
                  <p className="mt-3 text-[15px] text-muted">{label}. Ask your PM if this should be active.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
