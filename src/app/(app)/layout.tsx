import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { resolveTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  const { theme } = await resolveTheme(user);
  return (
    <AppShell user={{ name: user.name, role: user.role }} theme={theme} demo={isDemoMode()}>
      {children}
    </AppShell>
  );
}
