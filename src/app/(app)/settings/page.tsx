import Link from "next/link";
import { Database, History, Link2, LogOut, RotateCcw, Users, UserSquare } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { resetDemoAction } from "@/actions/admin";
import { ActionButton } from "@/components/forms/action-button";
import { isDemoMode } from "@/lib/env";
import { can } from "@/core/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";
import { SunlightToggle } from "./sunlight-toggle";
import { resolveTheme } from "@/lib/theme";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, ctx } = await requireSession();
  const { sunlight } = await resolveTheme(user);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl md:text-3xl">Settings</h1>

      <Card>
        <h2 className="text-lg">Profile</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15px]">
          <dt className="text-muted">Name</dt><dd>{user.name}</dd>
          <dt className="text-muted">Email</dt><dd className="code break-all">{user.email}</dd>
          <dt className="text-muted">Role</dt><dd>{ROLE_LABEL[user.role]}</dd>
        </dl>
      </Card>

      <Card>
        <h2 className="text-lg">Display</h2>
        <p className="mt-1 text-[15px] text-muted">
          Use the sun/moon button in the top bar to switch between dark and light. Your choice follows you to other devices.
        </p>
        <SunlightToggle initial={sunlight} />
      </Card>

      {(can(ctx, "read", "user") || can(ctx, "read", "assignment") || can(ctx, "read", "master")) && (
        <Card>
          <h2 className="text-lg">Manage</h2>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {[
              { href: "/clients", label: "Clients", icon: UserSquare, ok: can(ctx, "read", "client") },
              { href: "/users", label: "Users", icon: Users, ok: can(ctx, "read", "user") },
              { href: "/assignments", label: "Project assignments", icon: Link2, ok: can(ctx, "read", "assignment") },
              { href: "/masters", label: "Masters (materials, vendors, trades…)", icon: Database, ok: can(ctx, "read", "master") },
            ].filter((l) => l.ok).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-12 items-center gap-2 rounded-xl px-3 font-semibold text-brand-text hover:bg-surface-2">
                  <l.icon className="h-5 w-5" aria-hidden /> {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {can(ctx, "read", "audit") && (
        <Card>
          <h2 className="text-lg">Audit log</h2>
          <p className="mt-1 text-[15px] text-muted">Who did what, on which project, and when.</p>
          <Link href="/settings/audit" className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-brand-text">
            <History className="h-5 w-5" aria-hidden /> Open audit log
          </Link>
        </Card>
      )}

      {user.role === "OWNER" && isDemoMode() && (
        <Card>
          <h2 className="text-lg">Demo data</h2>
          <p className="mt-1 text-[15px] text-muted">
            Put all demo projects, users and masters back to their starting state. Do this just before a demo. Only records marked DEMO are touched, and everyone is signed out.
          </p>
          <div className="mt-3">
            <ActionButton
              variant="danger" label={<><RotateCcw className="h-4 w-4" aria-hidden /> Reset demo data</>}
              confirm="Reset all demo data? Everything you changed in the demo will be lost and you will be signed out. Demo accounts keep the password demo1234."
              action={resetDemoAction} successMessage="Demo data reset."
            />
          </div>
        </Card>
      )}

      <form action={logoutAction}>
        <Button type="submit" variant="secondary" size="lg" className="w-full sm:w-auto">
          <LogOut className="h-5 w-5" aria-hidden /> Sign out
        </Button>
      </form>
    </div>
  );
}
