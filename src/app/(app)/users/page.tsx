import { createUserAction, resetPasswordAction, updateUserAction } from "@/actions/admin";
import { can } from "@/core/auth/permissions";
import { listUsers } from "@/core/users/service";
import { db } from "@/lib/db";
import { ModalForm } from "@/components/forms/modal-form";
import { NoAccess } from "@/components/no-access";
import { DemoBadge } from "@/components/status-chip";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";
import type { FieldDef, Option } from "@/lib/forms";
import { CheckCircle2, CircleOff } from "lucide-react";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "user")) return <NoAccess />;

  const [users, clients] = await Promise.all([listUsers(ctx), db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const roleOptions: Option[] = Object.entries(ROLE_LABEL)
    .filter(([r]) => r !== "OWNER" || ctx.role === "OWNER")
    .map(([value, label]) => ({ value, label }));
  const clientOptions: Option[] = clients.map((c) => ({ value: c.id, label: c.name }));

  const createFields: FieldDef[] = [
    { name: "name", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email (used to sign in)", type: "text", required: true },
    { name: "role", label: "Role", type: "select", required: true, options: roleOptions },
    { name: "password", label: "Temporary password", type: "password", required: true, hint: "At least 8 characters. Share it privately; ask them to keep it safe." },
    { name: "clientId", label: "Client (only for Client logins)", type: "select", options: clientOptions },
  ];
  const editFields: FieldDef[] = [
    { name: "name", label: "Full name", type: "text", required: true },
    { name: "role", label: "Role", type: "select", required: true, options: roleOptions },
    { name: "clientId", label: "Client (only for Client logins)", type: "select", options: clientOptions },
    { name: "isActive", label: "Sign-in", type: "select", required: true, options: [{ value: "true", label: "Active" }, { value: "false", label: "Disabled" }] },
  ];
  const pwFields: FieldDef[] = [{ name: "password", label: "New password", type: "password", required: true, hint: "They will be signed out on all devices." }];
  const canCreate = can(ctx, "create", "user");
  const canUpdate = can(ctx, "update", "user");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">Users</h1>
          <p className="text-muted">{users.length} people. Project access for engineers, PMs, store keepers and quality engineers is set under Assignments.</p>
        </div>
        {canCreate && <ModalForm title="New user" label="New user" fields={createFields} action={createUserAction} successMessage="User created." />}
      </div>

      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[17px] font-semibold">{u.name}</span>
                {u.isDemo && <DemoBadge />}
                <Badge tone={u.isActive ? "ok" : "slate"}>
                  {u.isActive ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <CircleOff className="h-3.5 w-3.5" aria-hidden />}
                  {u.isActive ? "Active" : "Disabled"}
                </Badge>
              </div>
              <div className="text-sm text-muted">
                {ROLE_LABEL[u.role]}{u.client ? ` · ${u.client.name}` : ""} · <span className="code">{u.email}</span>
              </div>
            </div>
            {canUpdate && (
              <div className="flex gap-1">
                <ModalForm
                  title={`Edit ${u.name}`} label="Edit" icon="edit" variant="ghost" ariaLabel={`Edit ${u.name}`}
                  fields={editFields}
                  initial={{ name: u.name, role: u.role, clientId: u.clientId ?? "", isActive: String(u.isActive) }}
                  action={updateUserAction.bind(null, u.id)} successMessage="User updated."
                />
                <ModalForm
                  title={`Reset password — ${u.name}`} label="Reset password" icon="none" variant="ghost" ariaLabel={`Reset password for ${u.name}`}
                  fields={pwFields} action={resetPasswordAction.bind(null, u.id)} successMessage="Password reset." submitLabel="Reset password"
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
