import Link from "next/link";
import { notFound } from "next/navigation";
import { backInServiceAction, releaseEquipmentAction } from "@/actions/ops";
import { ActionButton } from "@/components/forms/action-button";
import { AssignEquipmentButton, LogEquipmentButton } from "@/components/ops/equipment-forms";
import { NoAccess } from "@/components/no-access";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AppError } from "@/core/errors";
import { EQUIPMENT_STATUS_LABEL, LOG_KIND_LABEL, getEquipment } from "@/core/equipment/service";
import { projectsWithActivities } from "@/core/ops/options";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Equipment" };

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession();
  let e;
  try { e = await getEquipment(ctx, id); } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    if (err instanceof AppError && err.code === "FORBIDDEN") return <NoAccess />;
    throw err;
  }
  const projects = !e.current && !e.onOtherProject && e.canManage ? await projectsWithActivities(ctx) : [];
  const activities = e.current ? (await projectsWithActivities(ctx)).find((p) => p.id === e.current!.projectId)?.activities ?? [] : [];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/equipment" className="text-[15px] text-muted hover:text-text">← Equipment</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl md:text-3xl">{e.name}</h1><Badge tone={e.status === "BREAKDOWN" ? "danger" : e.status === "MAINTENANCE" ? "warn" : e.status === "IN_USE" ? "plan" : "ok"}>{EQUIPMENT_STATUS_LABEL[e.status]}</Badge></div>
        <p className="text-muted"><span className="code">{e.code}</span> · {e.category} · {e.ownership.toLowerCase()}</p>
        <p className="text-muted">{e.current ? `On ${e.current.projectCode} ${e.current.projectName}${e.current.activity ? ` · ${e.current.activity}` : ""} since ${formatDate(e.current.since)}` : e.onOtherProject ? "On another project" : "Not on any project"}</p>
      </div>
      {e.canManage && (
        <div className="flex flex-wrap gap-2">
          {e.current && <LogEquipmentButton equipmentId={e.id} activities={activities} />}
          {(e.status === "BREAKDOWN" || e.status === "MAINTENANCE") && <ActionButton size="lg" variant="secondary" label="Back in service" successMessage="Back in service." action={backInServiceAction.bind(null, e.id)} />}
          {e.current && <ActionButton size="lg" variant="secondary" label="Release from project" confirm="Take this equipment off the project?" successMessage="Released." action={releaseEquipmentAction.bind(null, e.id)} />}
          {!e.current && !e.onOtherProject && e.status === "AVAILABLE" && projects.length > 0 && <AssignEquipmentButton equipmentId={e.id} projects={projects} />}
        </div>
      )}
      <Card>
        <h2 className="mb-2 text-lg">Log</h2>
        {e.logs.length === 0 ? <p className="text-muted">Nothing logged yet.</p> : (
          <ul className="divide-y divide-border">
            {e.logs.map((l) => (
              <li key={l.id} className="py-2.5">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{LOG_KIND_LABEL[l.kind]}{l.kind === "USAGE" ? ` · ${l.hours} h` : ""}</span><span className="text-sm text-muted">{formatDate(l.date)} · {l.project}</span></div>
                {(l.note || l.activity) && <p className="text-[15px]">{l.activity ? `${l.activity}. ` : ""}{l.note}</p>}
                <p className="text-sm text-muted">{l.by}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 text-lg">Where it has been</h2>
        {e.assignments.length === 0 ? <p className="text-muted">No assignments yet.</p> : (
          <ul className="divide-y divide-border">
            {e.assignments.map((a) => <li key={a.id} className="py-2.5 text-[16px]">{a.project}{a.activity ? ` · ${a.activity}` : ""} <span className="text-muted">— {formatDate(a.from)} to {a.to ? formatDate(a.to) : "now"}</span></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
