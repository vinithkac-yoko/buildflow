import Link from "next/link";
import { MapPin } from "lucide-react";
import { createProjectAction } from "@/actions/projects";
import { listProjects } from "@/core/projects/service";
import { can } from "@/core/auth/permissions";
import { db } from "@/lib/db";
import { ModalForm } from "@/components/forms/modal-form";
import { Card } from "@/components/ui/card";
import { DemoBadge, ProjectStatusChip } from "@/components/status-chip";
import { NoAccess } from "@/components/no-access";
import { requireSession } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/format";
import { projectFormFields } from "./project-fields";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { ctx, user } = await requireSession();
  if (!can(ctx, "read", "project")) return <NoAccess />;
  const projects = await listProjects(ctx);
  const showValue = projects.some((p) => p.contractValue !== undefined);
  const canCreate = can(ctx, "create", "project");
  const clients = canCreate ? await db.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">{user.role === "CLIENT" ? "Your project" : "Projects"}</h1>
          <p className="text-muted">
            {user.role === "SITE_ENGINEER" || user.role === "PROJECT_MANAGER"
              ? "Projects assigned to you."
              : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canCreate && (
          <ModalForm
            title="New project" label="New project" wide
            fields={projectFormFields({ clients: clients.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })), withValue: true })}
            initial={{ type: "Premium residential villa" }}
            action={createProjectAction}
            successMessage="Project created. It starts in Planning."
          />
        )}
      </div>

      {projects.length === 0 ? (
        <Card>
          <p className="font-medium">No projects yet.</p>
          <p className="text-muted">{canCreate ? "Use “New project” to add the first one." : "Ask the Owner or Admin to assign you to a project."}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p, i) => (
            <li key={p.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
              <Link href={`/projects/${p.id}`} className="panel block p-4 md:p-5 hover:bg-surface-2 transition-colors duration-fast">
                <div className="flex items-center justify-between gap-2">
                  <span className="code text-sm text-muted">{p.code}</span>
                  <div className="flex items-center gap-2">
                    {p.isDemo && <DemoBadge />}
                    <ProjectStatusChip status={p.status} />
                  </div>
                </div>
                <h2 className="mt-2 text-lg leading-snug">{p.name}</h2>
                <p className="mt-1 text-sm text-muted">{p.clientName}</p>
                <div className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {p.location}
                </div>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {showValue && p.contractValue !== undefined && (
                    <div>
                      <dt className="text-muted">Contract value</dt>
                      <dd className="num font-semibold">{formatInr(p.contractValue)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted">Target finish</dt>
                    <dd className="num font-semibold">{formatDate(p.currentFinish)}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
