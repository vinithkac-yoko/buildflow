import Link from "next/link";
import type { Role } from "@prisma/client";
import { NAV, bottomNav } from "@/config/navigation";
import { ROLE_LABEL } from "@/lib/format";
import { NavGlyph } from "./icons";
import { NavLinks, BottomLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { logoutAction } from "@/app/actions";
import { LogOut } from "lucide-react";

export function AppShell({
  user,
  theme,
  demo,
  children,
}: {
  user: { name: string; role: Role };
  theme: "dark" | "light";
  demo: boolean;
  children: React.ReactNode;
}) {
  const items = NAV[user.role];
  const bottom = bottomNav(user.role);
  const isEngineer = user.role === "SITE_ENGINEER";

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:sticky md:top-0 md:h-dvh flex-col border-r border-border bg-surface/70">
        <Link href="/" className="flex items-center gap-2 px-5 h-16 border-b border-border">
          <span aria-hidden className="h-7 w-7 rounded-lg bg-brand grid place-items-center text-brand-on font-bold code">B</span>
          <span className="text-lg font-semibold tracking-tight">BUILDFlow</span>
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
          <NavLinks items={items.map((i) => ({ href: i.href, label: i.label, icon: i.icon }))} />
        </nav>
        <div className="border-t border-border p-3 text-sm">
          <div className="px-2 pb-2">
            <div className="truncate font-medium">{user.name}</div>
            <div className="text-muted">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-[15px] font-semibold text-text hover:bg-surface-2 cursor-pointer">
              <LogOut className="h-5 w-5" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border px-4 md:px-6">
          <Link href="/" className="md:hidden flex min-h-11 items-center gap-2">
            <span aria-hidden className="h-7 w-7 rounded-lg bg-brand grid place-items-center text-brand-on font-bold code">B</span>
            <span className="font-semibold tracking-tight">BUILDFlow</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {demo && (
              <span className="rounded-md border border-warn/50 px-2 py-0.5 text-xs font-semibold tracking-wide text-warn" title="Demo data — not real client records">
                DEMO
              </span>
            )}
            <span className="hidden sm:block text-sm text-muted">{ROLE_LABEL[user.role]}</span>
            <ThemeToggle initial={theme} />
            <UserMenu name={user.name} roleLabel={ROLE_LABEL[user.role]} />
          </div>
        </header>

        <main
          className={
            "flex-1 px-4 py-5 md:px-8 md:py-8 " +
            (isEngineer ? "pb-32" : "pb-28 md:pb-8") // room for the bottom tab bar on phones
          }
        >
          {children}
        </main>
      </div>

      {/* Phone bottom tab bar (≤5 items, always visible, no hamburger) */}
      <nav
        aria-label="Primary"
        className="glass md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)]"
      >
        <BottomLinks
          items={[
            ...bottom.map((i) => ({ href: i.href, label: i.label, icon: i.icon })),
            { href: "/more", label: "More", icon: "more" as const },
          ]}
        />
      </nav>
    </div>
  );
}

export { NavGlyph };
