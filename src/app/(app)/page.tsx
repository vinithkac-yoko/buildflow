import Link from "next/link";
import { redirect } from "next/navigation";
import { listProjects } from "@/core/projects/service";
import { NAV } from "@/config/navigation";
import { Card } from "@/components/ui/card";
import { NavGlyph } from "@/components/shell/icons";
import { PortfolioScreen } from "@/components/portfolio/portfolio-screen";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, ctx } = await requireSession();
  if (user.role === "SITE_ENGINEER") redirect("/my-projects");
  if (user.role === "CLIENT") redirect("/projects");
  if (user.role === "OWNER" || user.role === "PROJECT_MANAGER") return <PortfolioScreen searchParams={await searchParams} />;

  const canListProjects = user.role !== "MARKETING" && user.role !== "HR";
  const projects = canListProjects ? await listProjects(ctx) : [];
  const count = (s: string) => projects.filter((p) => p.status === s).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl">Welcome, {user.name}</h1>
        <p className="text-muted">{ROLE_LABEL[user.role]}</p>
      </div>

      {canListProjects && (
        <section aria-label="Projects at a glance" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Active", count("ACTIVE")],
            ["Planning", count("PLANNING")],
            ["On hold", count("ON_HOLD")],
            ["Delayed", count("DELAYED")],
          ].map(([label, n], i) => (
            <Card key={label as string} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="text-sm text-muted">{label}</div>
              <div className="num mt-1 text-5xl font-light">{n}</div>
            </Card>
          ))}
        </section>
      )}

      <section aria-label="Your screens">
        <h2 className="mb-2 text-lg">Your screens</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {NAV[user.role].filter((n) => n.href !== "/").map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="panel flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <NavGlyph name={n.icon} className="h-5 w-5 shrink-0 text-muted" />
                <span><span className="block font-semibold">{n.label}</span><span className="block text-sm text-muted">{n.blurb}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
