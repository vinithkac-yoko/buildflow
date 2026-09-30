import Link from "next/link";
import { X } from "lucide-react";
import { unassignUserAction } from "@/actions/admin";
import { can } from "@/core/auth/permissions";
import { listProjects } from "@/core/projects/service";
import { assignableUsers, listAssignments } from "@/core/users/assignments";
import { ActionButton } from "@/components/forms/action-button";
import { AssignForm } from "@/components/forms/assign-form";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";

export const metadata = { title: "Assignments" };

export default async function AssignmentsPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "assignment")) return <NoAccess />;
  const canEdit = can(ctx, "create", "assignment");

  const [projects, assignments, users] = await Promise.all([listProjects(ctx), listAssignments(ctx), assignableUsers(ctx)]);
  const userOptions = users.map((u) => ({ value: u.id, label: `${u.name} — ${ROLE_LABEL[u.role]}` }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Assignments</h1>
        <p className="text-muted">Who works on which project. Engineers, PMs, store keepers and quality engineers only see projects they are assigned to.</p>
      </div>
      {projects.map((p) => {
        const team = assignments.filter((a) => a.projectId === p.id);
        return (
          <Card key={p.id} className="space-y-3">
            <div>
              <Link href={`/projects/${p.id}`} className="text-lg font-semibold hover:underline">{p.name}</Link>
              <div className="code text-xs text-muted">{p.code}</div>
            </div>
            {team.length === 0 ? (
              <p className="text-muted">Nobody assigned yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {team.map((a) => (
                  <li key={a.id} className="flex items-center gap-1 rounded-xl border border-border pl-3 text-[15px]">
                    <span>{a.user.name} <span className="text-muted">· {ROLE_LABEL[a.user.role]}</span></span>
                    {canEdit && (
                      <ActionButton
                        variant="ghost" ariaLabel={`Remove ${a.user.name} from ${p.name}`}
                        label={<X className="h-4 w-4" aria-hidden />}
                        confirm={`Remove ${a.user.name} from ${p.name}? They will no longer see this project.`}
                        action={unassignUserAction.bind(null, a.id)} successMessage="Removed."
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && <AssignForm projectId={p.id} users={userOptions} />}
          </Card>
        );
      })}
    </div>
  );
}
