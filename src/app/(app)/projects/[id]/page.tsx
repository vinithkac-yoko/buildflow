import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { getProject } from "@/core/projects/service";
import { AppError } from "@/core/errors";
import { Card } from "@/components/ui/card";
import { DemoBadge, ProjectStatusChip } from "@/components/status-chip";
import { NavGlyph } from "@/components/shell/icons";
import type { NavIcon } from "@/config/navigation";
import { requireSession } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/format";

const TILES: { label: string; icon: NavIcon; milestone: number }[] = [
  { label: "Planning", icon: "planning", milestone: 2 },
  { label: "Daily Reports", icon: "dpr", milestone: 3 },
  { label: "Labour", icon: "labour", milestone: 3 },
  { label: "Materials", icon: "materials", milestone: 4 },
  { label: "Procurement", icon: "procurement", milestone: 4 },
  { label: "Quality", icon: "quality", milestone: 5 },
  { label: "Equipment", icon: "issues", milestone: 6 },
  { label: "Payments", icon: "payments", milestone: 4 },
  { label: "Documents", icon: "documents", milestone: 6 },
];

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let p;
  try {
    p = await getProject(ctx, id);
  } catch (e) {
    if (e instanceof AppError) notFound(); // not assigned == not found (don't reveal it exists)
    throw e;
  }

  const facts: [string, string | undefined][] = [
    ["Client", p.client.name],
    ["Location", p.location],
    ["Contract value", p.contractValue !== undefined ? formatInr(p.contractValue) : undefined],
    ["Start date", formatDate(p.baselineStart)],
    ["Target finish", formatDate(p.baselineFinish)],
    ["Current finish", formatDate(p.currentFinish)],
    ["Health score", p.healthScore === null ? "Not scored yet" : String(p.healthScore)],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/projects" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All projects
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="code text-sm text-muted">{p.code}</span>
          <ProjectStatusChip status={p.status} />
          {p.isDemo && <DemoBadge />}
        </div>
        <h1 className="text-2xl md:text-3xl">{p.name}</h1>
      </header>

      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          {facts.filter(([, v]) => v !== undefined).map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="num font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section aria-labelledby="modules">
        <h2 id="modules" className="mb-3 text-lg">Project modules</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {TILES.map((t) => (
            <li key={t.label}>
              <div className="panel flex min-h-24 flex-col justify-between p-4 opacity-80" aria-disabled="true">
                <NavGlyph name={t.icon} className="h-6 w-6 text-planned" />
                <div>
                  <div className="font-medium">{t.label}</div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Lock className="h-3 w-3" aria-hidden /> Milestone {t.milestone}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
