import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame, Trash2, Unlink } from "lucide-react";
import {
  linkBoqAction, removeBomAction, setActivityStatusAction, unlinkBoqAction, updateActivityAction, upsertBomAction,
} from "@/actions/planning";
import { can, canSeeField } from "@/core/auth/permissions";
import { AppError } from "@/core/errors";
import { refOptionsFor } from "@/core/masters/service";
import { getActivity } from "@/core/planning/activities";
import { boqOptions } from "@/core/planning/boq";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_TRANSITIONS } from "@/core/planning/transitions";
import { listWbs } from "@/core/planning/wbs";
import { db } from "@/lib/db";
import { ActionButton } from "@/components/forms/action-button";
import { ModalForm } from "@/components/forms/modal-form";
import { ActivityStatusChip, DemoBadge } from "@/components/status-chip";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/format";
import type { FieldDef } from "@/lib/forms";
import { BOM_FIELDS, activityFields } from "../../fields";

export const metadata = { title: "Activity" };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function ActivityPage({ params }: { params: Promise<{ id: string; activityId: string }> }) {
  const { id, activityId } = await params;
  const { ctx } = await requireSession();

  let a;
  try {
    a = await getActivity(ctx, activityId);
    if (a.projectId !== id) notFound();
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }

  const canEdit = can(ctx, "update", "activity", id);
  const showCost = canSeeField(ctx, "plannedCost", id);
  const fields = activityFields(ctx, id);
  const wbs = await listWbs(ctx, id);
  const baseOptions = await refOptionsFor(fields);
  const options = { ...baseOptions, wbsNodeId: wbs.filter((n) => n.childCount === 0).map((n) => ({ value: n.id, label: `${n.code} ${n.name}` })) };

  const linkedIds = new Set(a.boqLinks.map((l) => l.boqItem.id));
  const boqOpts = can(ctx, "read", "boq", id) || canEdit ? (await boqOptions(ctx, id)).filter((o) => !linkedIds.has(o.value)) : [];
  const materials = (await db.material.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, uom: { select: { code: true } } } }))
    .filter((m) => !a.boms.some((b) => b.materialId === m.id))
    .map((m) => ({ value: m.id, label: `${m.name} (${m.uom.code})` }));

  const linkFields: FieldDef[] = [{ name: "boqItemId", label: "BOQ item", type: "ref", required: true }];
  const nextStatuses = canEdit ? ACTIVITY_TRANSITIONS[a.status] : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={`/projects/${id}/planning?tab=activities`} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Activities
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code text-sm text-muted">{a.code}</span>
            <ActivityStatusChip status={a.status} />
            {a.criticalPath && <span className="inline-flex items-center gap-1 text-sm font-semibold text-warn"><Flame className="h-4 w-4" aria-hidden /> Critical path</span>}
            {a.isDemo && <DemoBadge />}
          </div>
          <h1 className="text-2xl md:text-3xl">{a.name}</h1>
        </div>
        {canEdit && (
          <ModalForm title="Edit activity" label="Edit activity" icon="edit" variant="secondary" wide fields={fields} options={options}
            initial={{
              name: a.name, wbsNodeId: a.wbsNodeId, tradeId: a.tradeId ?? "", uomId: a.uomId, costCodeId: a.costCodeId ?? "",
              plannedQty: a.plannedQty, plannedStart: iso(a.plannedStart), plannedFinish: iso(a.plannedFinish),
              plannedMandays: a.plannedMandays, plannedCost: a.plannedCost ?? "", targetProductivity: a.targetProductivity ?? "",
              criticalPath: String(a.criticalPath),
            }}
            action={updateActivityAction.bind(null, activityId)} successMessage="Activity updated." />
        )}
      </header>

      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          {([
            ["WBS", `${a.wbsNode.code} ${a.wbsNode.name}`],
            ["Trade", a.trade?.name ?? "—"],
            ["Cost code", a.costCode ? `${a.costCode.code} ${a.costCode.name}` : "—"],
            ["Planned quantity", `${a.plannedQty} ${a.uom.code}`],
            ["Planned start", formatDate(a.plannedStart)],
            ["Planned finish", formatDate(a.plannedFinish)],
            ["Planned mandays", a.plannedMandays],
            ["Target productivity", a.targetProductivity ? `${a.targetProductivity} ${a.uom.code}/manday` : "—"],
            ...(showCost && a.plannedCost !== undefined ? [["Planned cost", formatInr(a.plannedCost)] as [string, string]] : []),
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}><dt className="text-sm text-muted">{k}</dt><dd className="num font-semibold">{v}</dd></div>
          ))}
        </dl>
        {nextStatuses.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="text-sm text-muted">Change status:</span>
            {nextStatuses.map((s) => (
              <ActionButton key={s} label={s === "HALTED" ? "Halt" : s === "IN_PROGRESS" && a.status === "COMPLETED" ? "Reopen" : s === "IN_PROGRESS" ? "Start / resume" : "Mark completed"}
                confirm={`Change this activity from ${ACTIVITY_STATUS_LABEL[a.status].toLowerCase()} to ${ACTIVITY_STATUS_LABEL[s].toLowerCase()}?`}
                action={setActivityStatusAction.bind(null, activityId, s)} successMessage={`Now ${ACTIVITY_STATUS_LABEL[s].toLowerCase()}.`} />
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg">Linked BOQ items</h2>
            {canEdit && boqOpts.length > 0 && (
              <ModalForm title="Link a BOQ item" label="Link" variant="ghost" fields={linkFields} options={{ boqItemId: boqOpts }}
                action={linkBoqAction.bind(null, activityId)} successMessage="Linked." submitLabel="Link" />
            )}
          </div>
          {a.boqLinks.length === 0 ? <p className="text-muted">Not linked to any BOQ item yet.</p> : (
            <ul className="space-y-1">
              {a.boqLinks.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-[15px]">
                  <span><span className="code text-muted">{l.boqItem.itemCode}</span> {l.boqItem.description}</span>
                  {canEdit && <ActionButton variant="ghost" ariaLabel={`Unlink ${l.boqItem.itemCode}`} label={<Unlink className="h-4 w-4" aria-hidden />}
                    confirm={`Unlink ${l.boqItem.itemCode} from this activity?`} action={unlinkBoqAction.bind(null, activityId, l.boqItem.id)} successMessage="Unlinked." />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg">Material BOM</h2>
            {canEdit && materials.length > 0 && (
              <ModalForm title="Add material to BOM" label="Add" variant="ghost" fields={BOM_FIELDS} options={{ materialId: materials }}
                initial={{ wastagePct: "0" }} action={upsertBomAction.bind(null, activityId)} successMessage="BOM line added." />
            )}
          </div>
          {a.boms.length === 0 ? <p className="text-muted">No standard materials set. Add them to compare actual use against the standard.</p> : (
            <ul className="divide-y divide-border">
              {a.boms.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-[15px]">
                  <span>
                    {b.material.name}
                    <span className="num block text-sm text-muted">{b.coefficient} {b.material.uom.code} per {a.uom.code} · wastage {b.wastagePct}%</span>
                  </span>
                  {canEdit && (
                    <span className="flex">
                      <ModalForm title={`Edit ${b.material.name}`} label="Edit" icon="edit" variant="ghost" fields={BOM_FIELDS.filter((f) => f.name !== "materialId")}
                        initial={{ coefficient: b.coefficient, wastagePct: b.wastagePct, materialId: b.materialId }} hiddenKeys={["materialId"]}
                        ariaLabel={`Edit ${b.material.name}`} action={upsertBomAction.bind(null, activityId)} successMessage="BOM line updated." />
                      <ActionButton variant="ghost" ariaLabel={`Remove ${b.material.name}`} label={<Trash2 className="h-4 w-4" aria-hidden />}
                        confirm={`Remove ${b.material.name} from this activity's BOM?`} action={removeBomAction.bind(null, activityId, b.materialId)} successMessage="Removed." />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
