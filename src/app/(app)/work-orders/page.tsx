import Link from "next/link";
import { HardHat } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { activeSubcontractors, projectsWithActivities } from "@/core/ops/options";
import { WO_STATUS_LABEL, listWorkOrders } from "@/core/subcontract/service";
import { WorkOrderCreateButton } from "@/components/ops/workorder-forms";
import { inr } from "@/components/procurement/status";
import { Badge } from "@/components/ui/badge";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Work orders" };

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "work_order")) return <NoAccess />;
  const sp = await searchParams;
  const projectId = Array.isArray(sp.project) ? sp.project[0] : sp.project;
  const canCreate = can(ctx, "create", "work_order");
  const [orders, projects, subs] = await Promise.all([listWorkOrders(ctx, { projectId }), canCreate ? projectsWithActivities(ctx) : Promise.resolve([]), canCreate ? activeSubcontractors() : Promise.resolve([])]);
  const units = Object.fromEntries(projects.flatMap((p) => p.activities.map((a) => [a.id, a.unit])));
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl md:text-3xl">Subcontractor work orders</h1><p className="text-muted">Work given to subcontractors, what has been measured, and what has been billed and paid.</p></div>
        {canCreate && projects.length > 0 && <WorkOrderCreateButton projects={projects} subcontractors={subs} units={units} />}
      </div>
      {orders.length === 0 ? <Card className="flex items-start gap-3"><HardHat className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>No work orders yet.</p></Card> : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}><Link href={`/work-orders/${o.id}`} className="panel block p-4 hover:bg-surface-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code text-[17px] font-semibold">{o.code}</span> <span className="text-muted">· {o.subcontractor}</span></span><Badge tone={o.status === "CANCELLED" ? "slate" : o.status === "COMPLETED" ? "ok" : "plan"}>{WO_STATUS_LABEL[o.status]}</Badge></div>
              <p className="mt-1 text-[16px]">{o.title}</p>
              <p className="text-sm text-muted">{o.projectCode} {o.projectName} · issued {formatDate(o.issuedOn)} · {o.lines} line{o.lines === 1 ? "" : "s"} · {o.measuredPct}% measured</p>
              {o.workTotal !== undefined && <p className="num mt-1 text-[16px]">Value {inr(o.workTotal)} · billed {inr(o.billed)}{o.unbilledValue ? ` · ${inr(o.unbilledValue)} measured, not yet billed` : ""}</p>}
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
