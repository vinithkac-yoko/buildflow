import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { MASTERS, MASTER_GROUPS, getMaster } from "@/core/masters/registry";
import { Card } from "@/components/ui/card";
import { NoAccess } from "@/components/no-access";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Masters" };

const ROUTE: Record<string, string> = {
  client: "/clients", vendor: "/vendors", employee: "/employees", "contract-labour": "/contract-labour",
};

export default async function MastersPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "master")) return <NoAccess />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl">Masters</h1>
        <p className="text-muted">Company-wide reference lists. Every dropdown in the app picks from these, so there is no free-text typing.</p>
      </div>
      {MASTER_GROUPS.map((g) => {
        const defs = g.kinds.map((k) => getMaster(k)).filter((d): d is NonNullable<typeof d> => !!d && can(ctx, "read", d.resource));
        if (defs.length === 0) return null;
        return (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g.title}</h2>
            <Card className="divide-y divide-border p-0 md:p-0">
              {defs.map((d) => (
                <Link key={d.kind} href={ROUTE[d.kind] ?? `/masters/${d.kind}`} className="flex min-h-14 items-center justify-between gap-3 px-4 text-[17px] hover:bg-surface-2/60">
                  {d.plural}
                  <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
                </Link>
              ))}
            </Card>
          </section>
        );
      })}
      <p className="text-sm text-muted">{MASTERS.length} lists. Storage locations are managed inside each project.</p>
    </div>
  );
}
