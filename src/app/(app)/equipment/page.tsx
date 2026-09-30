import Link from "next/link";
import { Wrench } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { EQUIPMENT_STATUS_LABEL, listEquipment } from "@/core/equipment/service";
import { projectsWithActivities } from "@/core/ops/options";
import { AssignEquipmentButton } from "@/components/ops/equipment-forms";
import { Badge } from "@/components/ui/badge";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Equipment" };

const OWN = { COMPANY: "Company", RENTAL: "Rental", SUBCONTRACTOR: "Subcontractor" } as const;
const TONE = { AVAILABLE: "ok", IN_USE: "plan", MAINTENANCE: "warn", BREAKDOWN: "danger" } as const;

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "equipment")) return <NoAccess />;
  const sp = await searchParams;
  const projectId = Array.isArray(sp.project) ? sp.project[0] : sp.project;
  const [rows, projects] = await Promise.all([listEquipment(ctx, { projectId }), can(ctx, "create", "equipment_log") ? projectsWithActivities(ctx) : Promise.resolve([])]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl">Equipment</h1>
        <p className="text-muted">Where each machine is, whether it is working, and its hours. A machine is on one project at a time.{projectId ? " Showing one project." : ""}</p>
      </div>
      {rows.length === 0 ? <Card className="flex items-start gap-3"><Wrench className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>{projectId ? "No equipment is on this project." : "No equipment in the register yet."}</p></Card> : (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><Link href={`/equipment/${e.id}`} className="inline-flex min-h-11 items-center text-[18px] font-semibold underline-offset-2 hover:underline">{e.name}</Link> <span className="code text-sm text-muted">{e.code}</span></span>
                <span className="flex gap-2"><Badge tone="slate">{OWN[e.ownership]}</Badge><Badge tone={TONE[e.status]}>{EQUIPMENT_STATUS_LABEL[e.status]}</Badge></span>
              </div>
              <p className="mt-1 text-[15px] text-muted">{e.category} · {e.assignment ? `On ${e.assignment.projectCode}${e.assignment.projectName ? ` ${e.assignment.projectName}` : ""}${e.assignment.activity ? ` · ${e.assignment.activity}` : ""} since ${formatDate(e.assignment.since)}` : "Not on any project"}</p>
              {e.onMyProject || !e.assignment ? <p className="num text-sm text-muted">{e.hours30} h worked in the last 30 days{e.breakdowns30 ? ` · ${e.breakdowns30} breakdown${e.breakdowns30 === 1 ? "" : "s"}` : ""}</p> : null}
              {!e.assignment && e.canManage && e.status === "AVAILABLE" && projects.length > 0 && <div className="mt-2"><AssignEquipmentButton equipmentId={e.id} projects={projects} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
