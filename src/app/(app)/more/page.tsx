import Link from "next/link";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { NAV } from "@/config/navigation";
import { NavGlyph } from "@/components/shell/icons";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "More" };

export default async function MorePage() {
  const { user } = await requireSession();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl">More</h1>
      <ul className="space-y-2">
        {[...NAV[user.role], { label: "Profile & settings", href: "/settings", icon: "settings" as const }]
          .filter((n, i, a) => a.findIndex((x) => x.href === n.href) === i)
          .map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="panel flex min-h-14 items-center gap-3 px-4 text-[17px] font-medium hover:bg-surface-2">
                <NavGlyph name={n.icon} className="h-6 w-6 text-planned" />
                {n.label}
              </Link>
            </li>
          ))}
      </ul>
      <form action={logoutAction}>
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          <LogOut className="h-5 w-5" aria-hidden /> Sign out
        </Button>
      </form>
    </div>
  );
}
