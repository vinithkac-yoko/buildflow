import Link from "next/link";
import { History, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
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

      {can(ctx, "read", "audit") && (
        <Card>
          <h2 className="text-lg">Audit log</h2>
          <p className="mt-1 text-[15px] text-muted">Who did what, on which project, and when.</p>
          <Link href="/settings/audit" className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-brand-text">
            <History className="h-5 w-5" aria-hidden /> Open audit log
          </Link>
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
