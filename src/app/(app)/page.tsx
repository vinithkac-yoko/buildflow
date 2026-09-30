import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderKanban, Info } from "lucide-react";
import { listProjects } from "@/core/projects/service";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function HomePage() {
  const { user, ctx } = await requireSession();
  if (user.role === "SITE_ENGINEER") redirect("/my-projects");
  if (user.role === "CLIENT") redirect("/projects");

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

      <Card className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-planned" aria-hidden />
        <div className="text-[15px]">
          <p className="font-medium">Milestone 2 · masters</p>
          <p className="text-muted">
            Sign-in, roles, projects, planning (WBS, activities, BOQ) and all master lists are live. Daily reports, stock, quality and the portfolio view arrive in the next milestones.
          </p>
          {canListProjects && (
            <Link href="/projects" className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold text-brand-text">
              <FolderKanban className="h-5 w-5" aria-hidden /> Open projects
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
