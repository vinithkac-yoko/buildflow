import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame, Trash2 } from "lucide-react";
import {
  createActivityAction, createBoqAction, createBoqRevisionAction, createWbsAction, deleteWbsAction, renameWbsAction, updateBoqAction,
} from "@/actions/planning";
import { can, canSeeField } from "@/core/auth/permissions";
import { AppError } from "@/core/errors";
import { refOptionsFor } from "@/core/masters/service";
import { listActivities } from "@/core/planning/activities";
import { listBoq } from "@/core/planning/boq";
import { listWbs } from "@/core/planning/wbs";
import { getProject } from "@/core/projects/service";
import { ActionButton } from "@/components/forms/action-button";
import { ModalForm } from "@/components/forms/modal-form";
import { ActivityStatusChip, DemoBadge } from "@/components/status-chip";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDate, formatInr } from "@/lib/format";
import type { FieldDef } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { activityFields, boqFields } from "./fields";

export const metadata = { title: "Planning" };

type SP = Record<string, string | string[] | undefined>;
const TABS = [
  { key: "wbs", label: "WBS" },
  { key: "activities", label: "Activities" },
  { key: "boq", label: "BOQ" },
] as const;

const nameField: FieldDef[] = [{ name: "name", label: "Name", type: "text", required: true }];
const revisionFields: FieldDef[] = [{ name: "note", label: "What changed?", type: "text", hint: "e.g. Client variation: extra marble" }];

export default async function PlanningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "wbs";
  const { ctx } = await requireSession();

  let project;
  try {
    project = await getProject(ctx, id);
    if (!can(ctx, "read", "activity", id)) throw new AppError("FORBIDDEN", "no");
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const canBoq = can(ctx, "read", "boq", id);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={`/projects/${id}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {project.name}
      </Link>
      <div>
        <div className="flex items-center gap-2"><span className="code text-sm text-muted">{project.code}</span>{project.isDemo && <DemoBadge />}</div>
        <h1 className="text-2xl md:text-3xl">Planning</h1>
      </div>

      <nav aria-label="Planning sections" className="flex gap-1 border-b border-border">
        {TABS.filter((t) => t.key !== "boq" || canBoq).map((t) => (
          <Link
            key={t.key}
            href={`/projects/${id}/planning?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center border-b-2 px-4 text-[15px] font-semibold",
              tab === t.key ? "border-brand text-brand-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "wbs" && <WbsTab projectId={id} />}
      {tab === "activities" && <ActivitiesTab projectId={id} />}
      {tab === "boq" && canBoq && <BoqTab projectId={id} />}
    </div>
  );
}

async function WbsTab({ projectId }: { projectId: string }) {
  const { ctx } = await requireSession();
  const nodes = await listWbs(ctx, projectId);
  const canCreate = can(ctx, "create", "wbs", projectId);
  const canEdit = can(ctx, "update", "wbs", projectId);
  const canDelete = can(ctx, "delete", "wbs", projectId);
  const depth = (code: string) => code.split(".").length - 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">{nodes.length} items. Activities attach to the lowest level.</p>
        {canCreate && <ModalForm title="New top-level WBS item" label="New top-level item" fields={nameField} action={createWbsAction.bind(null, projectId)} successMessage="WBS item added." />}
      </div>
      {nodes.length === 0 ? (
        <Card><p className="font-medium">No WBS yet.</p><p className="text-muted">Add the first top-level item, e.g. “Foundation”.</p></Card>
      ) : (
        <Card className="p-0 md:p-0">
          <ul className="divide-y divide-border">
            {nodes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2" style={{ paddingLeft: `${1 + depth(n.code) * 1.25}rem` }}>
                <div className="min-w-0">
                  <span className="code mr-2 text-sm text-muted">{n.code}</span>
                  <span className={depth(n.code) === 0 ? "font-semibold" : ""}>{n.name}</span>
                  {n.activityCount > 0 && <span className="ml-2 text-sm text-muted">{n.activityCount} {n.activityCount === 1 ? "activity" : "activities"}</span>}
                </div>
                <div className="flex items-center">
                  {canCreate && (
                    <ModalForm title={`New item under ${n.name}`} label="Add child" variant="ghost" fields={nameField}
                      action={createWbsAction.bind(null, projectId)} successMessage="WBS item added." ariaLabel={`Add child under ${n.name}`}
                      // parent is passed through initial values so the server action receives it
                      initial={{ parentId: n.id }} hiddenKeys={["parentId"]} />
                  )}
                  {canEdit && (
                    <ModalForm title="Rename WBS item" label="Rename" icon="edit" variant="ghost" fields={nameField} initial={{ name: n.name }}
                      action={renameWbsAction.bind(null, n.id)} successMessage="Renamed." ariaLabel={`Rename ${n.name}`} />
                  )}
                  {canDelete && n.childCount === 0 && n.activityCount === 0 && (
                    <ActionButton variant="ghost" label={<Trash2 className="h-4 w-4" aria-hidden />} ariaLabel={`Delete ${n.name}`}
                      confirm={`Delete “${n.name}”? This can't be undone.`} action={deleteWbsAction.bind(null, n.id)} successMessage="Deleted." />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

async function ActivitiesTab({ projectId }: { projectId: string }) {
  const { ctx } = await requireSession();
  const [activities, wbs] = await Promise.all([listActivities(ctx, projectId), listWbs(ctx, projectId)]);
  const fields = activityFields(ctx, projectId);
  const options = { ...(await refOptionsFor(fields)), wbsNodeId: wbs.filter((n) => n.childCount === 0).map((n) => ({ value: n.id, label: `${n.code} ${n.name}` })) };
  const canCreate = can(ctx, "create", "activity", projectId);
  const showCost = canSeeField(ctx, "plannedCost", projectId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">{activities.length} activities · <Flame className="inline h-4 w-4 text-warn" aria-hidden /> marks the critical path</p>
        {canCreate && (
          <ModalForm title="New activity" label="New activity" wide fields={fields} options={options}
            initial={{ criticalPath: "false", plannedMandays: "0", plannedCost: "0" }}
            action={createActivityAction.bind(null, projectId)} successMessage="Activity added." />
        )}
      </div>
      {activities.length === 0 ? (
        <Card><p className="font-medium">No activities yet.</p><p className="text-muted">Add the first one and link it to a WBS item.</p></Card>
      ) : (
        <>
          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[15px]">
              <thead className="border-b border-border text-sm text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th><th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">WBS</th><th className="px-4 py-3 text-right font-medium">Planned qty</th>
                  <th className="px-4 py-3 font-medium">Planned dates</th><th className="px-4 py-3 text-right font-medium">Mandays</th>
                  {showCost && <th className="px-4 py-3 text-right font-medium">Planned cost</th>}
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                    <td className="code px-4 py-3 text-muted">{a.code}</td>
                    <td className="px-4 py-3">
                      <Link href={`/projects/${projectId}/planning/activities/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                      {a.criticalPath && <Flame className="ml-1.5 inline h-4 w-4 text-warn" aria-label="Critical path" />}
                    </td>
                    <td className="px-4 py-3 text-muted">{a.wbsNode.code} {a.wbsNode.name}</td>
                    <td className="num px-4 py-3 text-right">{a.plannedQty} {a.uom.code}</td>
                    <td className="num px-4 py-3 whitespace-nowrap">{formatDate(a.plannedStart)} → {formatDate(a.plannedFinish)}</td>
                    <td className="num px-4 py-3 text-right">{a.plannedMandays}</td>
                    {showCost && <td className="num px-4 py-3 text-right">{a.plannedCost !== undefined ? formatInr(a.plannedCost) : "—"}</td>}
                    <td className="px-4 py-3"><ActivityStatusChip status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {activities.map((a) => (
              <li key={a.id}>
                <Link href={`/projects/${projectId}/planning/activities/${a.id}`} className="panel block p-4">
                  <div className="flex items-center justify-between gap-2"><span className="code text-xs text-muted">{a.code}</span><ActivityStatusChip status={a.status} /></div>
                  <div className="mt-1 text-[17px] font-semibold leading-snug">{a.name}{a.criticalPath && <Flame className="ml-1.5 inline h-4 w-4 text-warn" aria-label="Critical path" />}</div>
                  <div className="mt-1 text-sm text-muted">{a.wbsNode.code} {a.wbsNode.name}</div>
                  <div className="num mt-2 text-sm">{a.plannedQty} {a.uom.code} · {formatDate(a.plannedStart)} → {formatDate(a.plannedFinish)}</div>
                  {showCost && a.plannedCost !== undefined && <div className="num mt-1 text-sm text-muted">Planned cost <span className="font-semibold text-text">{formatInr(a.plannedCost)}</span></div>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

async function BoqTab({ projectId }: { projectId: string }) {
  const { ctx } = await requireSession();
  const { items, revisions } = await listBoq(ctx, projectId);
  const fields = boqFields(ctx, projectId);
  const options = await refOptionsFor(fields);
  const canCreate = can(ctx, "create", "boq", projectId);
  const canEdit = can(ctx, "update", "boq", projectId);
  const showRate = canSeeField(ctx, "clientRate", projectId);
  const showBudget = canSeeField(ctx, "budget", projectId);
  const clientTotal = items.reduce((s, b) => s + (b.clientRate !== undefined ? (Number(b.originalQty) + Number(b.approvedVariationQty)) * Number(b.clientRate) : 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          {items.length} items · {revisions.length === 0 ? "no saved revisions" : `revision ${revisions[0].number} is the latest`}
          {showRate && <> · client value <span className="num font-semibold text-text">{formatInr(clientTotal)}</span></>}
        </p>
        <div className="flex flex-wrap gap-2">
          {canEdit && <ModalForm title="Save BOQ revision" label="Save as revision" icon="none" variant="secondary" fields={revisionFields}
            action={createBoqRevisionAction.bind(null, projectId)} successMessage="Revision saved." submitLabel="Save revision" />}
          {canCreate && <ModalForm title="New BOQ item" label="New BOQ item" wide fields={fields} options={options} initial={{ approvedVariationQty: "0" }}
            action={createBoqAction.bind(null, projectId)} successMessage="BOQ item added." />}
        </div>
      </div>

      {items.length === 0 ? (
        <Card><p className="font-medium">No BOQ items yet.</p><p className="text-muted">Add the contract BOQ lines, then link them to activities.</p></Card>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead className="border-b border-border text-sm text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th><th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 text-right font-medium">Original</th><th className="px-4 py-3 text-right font-medium">Variation</th>
                {showRate && <th className="px-4 py-3 text-right font-medium">Client rate</th>}
                {showBudget && <th className="px-4 py-3 text-right font-medium">Budget rate</th>}
                <th className="px-4 py-3 font-medium">Linked activities</th>
                {canEdit && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                  <td className="code px-4 py-3 text-muted">{b.itemCode}</td>
                  <td className="px-4 py-3">{b.description}</td>
                  <td className="num px-4 py-3 text-right">{b.originalQty} {b.uom.code}</td>
                  <td className="num px-4 py-3 text-right">{Number(b.approvedVariationQty) === 0 ? "—" : b.approvedVariationQty}</td>
                  {showRate && <td className="num px-4 py-3 text-right">{b.clientRate !== undefined ? formatInr(b.clientRate) : "—"}</td>}
                  {showBudget && <td className="num px-4 py-3 text-right">{b.internalBudgetRate !== undefined ? formatInr(b.internalBudgetRate) : "—"}</td>}
                  <td className="px-4 py-3 text-sm text-muted">
                    {b.activities.length === 0 ? "—" : b.activities.map((a) => (
                      <Link key={a.id} href={`/projects/${projectId}/planning/activities/${a.id}`} className="mr-2 code hover:underline">{a.code}</Link>
                    ))}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right">
                      <ModalForm title="Edit BOQ item" label="Edit" icon="edit" variant="ghost" wide ariaLabel={`Edit ${b.itemCode}`}
                        fields={fields} options={options}
                        initial={{
                          itemCode: b.itemCode, description: b.description, uomId: b.uom.id, originalQty: b.originalQty,
                          approvedVariationQty: b.approvedVariationQty, clientRate: b.clientRate ?? "", internalBudgetRate: b.internalBudgetRate ?? "",
                        }}
                        action={updateBoqAction.bind(null, b.id)} successMessage="BOQ item updated." />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {revisions.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg">Revisions</h2>
          <ul className="space-y-1.5 text-[15px]">
            {revisions.map((r) => (
              <li key={r.id}><span className="code">Rev {r.number}</span> · {formatDate(r.createdAt)}{r.note ? ` · ${r.note}` : ""}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

