import Link from "next/link";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { stockForProject } from "@/core/inventory/stock";
import { listProjects } from "@/core/projects/service";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { stockOpsData } from "@/core/procurement/options";
import { StockOps } from "@/components/procurement/office-actions";
import { NoAccess } from "@/components/no-access";
import { requireSession } from "@/lib/auth";
import { formatInr } from "@/lib/format";

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Project-wise stock by material with location split and low-stock flags. Valuation only for cost-visible roles. */
export async function StockScreen({ projectId }: { projectId?: string }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "inventory")) return <NoAccess />;
  const projects = (await listProjects(ctx)).filter((p) => p.status !== "PLANNING" && p.status !== "CANCELLED");
  const selected = projects.find((p) => p.id === projectId) ?? projects[0];
  const stock = selected ? await stockForProject(ctx, selected.id) : [];
  const showValue = stock.some((s) => s.avgCost !== undefined);
  const low = stock.filter((s) => s.low).length;
  const ops = selected && can(ctx, "create", "inventory", selected.id)
    ? await stockOpsData(ctx, selected.id, projects.filter((p) => p.id !== selected.id).map((p) => ({ id: p.id, code: p.code, name: p.name })))
    : null;
  const canRequest = can(ctx, "create", "material_request");
  const canSeeRequests = can(ctx, "read", "material_request");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Stock</h1>
        <p className="text-muted">Material held on each project, by storage location. Stock changes through recorded receipts, issues, returns, transfers and approved reports.</p>
      </div>
      {(canRequest || canSeeRequests) && (
        <div className="flex flex-wrap gap-2">
          {canRequest && <Link href="/requests/new" className="inline-flex min-h-14 items-center rounded-xl bg-brand px-5 text-[17px] font-semibold text-brand-on hover:brightness-110">Request material</Link>}
          {canSeeRequests && <Link href="/requests" className="inline-flex min-h-14 items-center rounded-xl border-2 border-border px-5 text-[17px] font-semibold hover:bg-surface-2">{canRequest ? "My requests" : "Material requests"}</Link>}
        </div>
      )}
      {ops && <StockOps d={ops} />}
      {projects.length > 1 && (
        <nav aria-label="Projects" className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <Link key={p.id} href={`?project=${p.id}`} aria-current={p.id === selected?.id ? "page" : undefined}
              className={`flex min-h-12 items-center rounded-xl border-2 px-4 text-[15px] font-semibold ${p.id === selected?.id ? "border-brand bg-brand text-brand-on" : "border-border hover:bg-surface-2"}`}>
              {p.code}
            </Link>
          ))}
        </nav>
      )}
      {selected && <p className="text-[15px]"><span className="code text-muted">{selected.code}</span> <span className="font-semibold">{selected.name}</span>{low > 0 && <span className="ml-2 inline-flex items-center gap-1 text-warn"><AlertTriangle className="h-4 w-4" aria-hidden />{low} low</span>}</p>}
      {stock.length === 0 ? (
        <Card className="flex items-start gap-3"><PackageOpen className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><div><p className="font-medium">No stock recorded for this project yet.</p><p className="text-muted">It appears here once material is received.</p></div></Card>
      ) : (
        <ul className="space-y-2">
          {stock.map((s) => (
            <li key={s.materialId} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[17px] font-semibold leading-snug">{s.name}</div>
                  <div className="text-sm text-muted"><span className="code">{s.code}</span> · {s.category}</div>
                </div>
                <div className="text-right">
                  <div className="num text-[24px] font-semibold">{fmt(s.total)} <span className="text-base font-medium text-muted">{s.unit}</span></div>
                  {s.low && <Badge tone="warn"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />Low — reorder at {s.reorderThreshold}</Badge>}
                </div>
              </div>
              <p className="num mt-2 text-sm text-muted">{s.locations.map((l) => `${l.name} ${fmt(l.quantity)}`).join(" · ") || "Nothing in stock"}{showValue && s.avgCost !== undefined ? ` · avg ${formatInr(s.avgCost)} per ${s.unit}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
