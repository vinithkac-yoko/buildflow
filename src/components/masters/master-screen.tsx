import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { saveMasterAction } from "@/actions/masters";
import { can } from "@/core/auth/permissions";
import { getMaster } from "@/core/masters/registry";
import { listMaster, refOptionsFor } from "@/core/masters/service";
import { ModalForm } from "@/components/forms/modal-form";
import { NoAccess } from "@/components/no-access";
import { DemoBadge } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

/** One list screen for every master: search, table (cards on phones), create and edit in a modal. */
export async function MasterScreen({ kind, q, backHref }: { kind: string; q?: string; backHref?: string }) {
  const { ctx } = await requireSession();
  const def = getMaster(kind);
  if (!def) return <NoAccess message="That list doesn't exist." />;
  if (!can(ctx, "read", def.resource)) return <NoAccess />;

  const { fields, rows } = await listMaster(ctx, kind, q);
  const options = await refOptionsFor(fields);
  const columns = fields.filter((f) => f.list);
  const canCreate = can(ctx, "create", def.resource);
  const canEdit = can(ctx, "update", def.resource);
  const formFields = fields; // form omits nothing the caller may see; sensitive fields they can't see are already dropped

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {backHref && (
        <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All masters
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">{def.plural}</h1>
          <p className="text-muted">{rows.length} {rows.length === 1 ? "record" : "records"}{q ? ` matching “${q}”` : ""}</p>
        </div>
        {canCreate && (
          <ModalForm
            title={`New ${def.label.toLowerCase()}`}
            label={`New ${def.label.toLowerCase()}`}
            fields={formFields}
            options={options}
            action={saveMasterAction.bind(null, kind, null)}
            successMessage={`${def.label} added.`}
          />
        )}
      </div>

      <form method="get" role="search" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q" defaultValue={q ?? ""} placeholder={`Search ${def.plural.toLowerCase()}…`} aria-label={`Search ${def.plural}`}
            className="min-h-12 w-full rounded-xl border border-border bg-bg pl-10 pr-3 text-[17px]"
          />
        </div>
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <p className="font-medium">{q ? "Nothing matches that search." : `No ${def.plural.toLowerCase()} yet.`}</p>
          <p className="text-muted">{q ? "Try a different word, or clear the search." : canCreate ? `Use “New ${def.label.toLowerCase()}” to add the first one.` : "Ask the Owner or Admin to add some."}</p>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[15px]">
              <thead className="border-b border-border text-sm text-muted">
                <tr>
                  {def.codePrefix && <th className="px-4 py-3 font-medium">Code</th>}
                  {columns.map((c) => <th key={c.name} className="px-4 py-3 font-medium">{c.label}{c.unit ? ` (${c.unit})` : ""}</th>)}
                  {canEdit && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                    {def.codePrefix && <td className="code px-4 py-3 text-muted">{r.code}</td>}
                    {columns.map((c, i) => (
                      <td key={c.name} className={"px-4 py-3 " + (c.type === "number" || c.type === "integer" ? "num text-right" : "")}>
                        {r.cells[c.name] || <span className="text-muted">—</span>}
                        {i === 0 && r.isDemo && <span className="ml-2 align-middle"><DemoBadge /></span>}
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-4 py-2 text-right">
                        <ModalForm
                          title={`Edit ${def.label.toLowerCase()}`} label="Edit" icon="edit" variant="ghost"
                          ariaLabel={`Edit ${r.cells[columns[0]?.name] ?? r.code ?? def.label}`}
                          fields={formFields} initial={r.values} options={options}
                          action={saveMasterAction.bind(null, kind, r.id)} successMessage={`${def.label} updated.`}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {def.codePrefix && <div className="code text-xs text-muted">{r.code}</div>}
                    <div className="text-[17px] font-semibold leading-snug">
                      {r.cells[columns[0]?.name]} {r.isDemo && <DemoBadge />}
                    </div>
                  </div>
                  {canEdit && (
                    <ModalForm
                      title={`Edit ${def.label.toLowerCase()}`} label="Edit" icon="edit" variant="ghost"
                      ariaLabel={`Edit ${r.cells[columns[0]?.name] ?? def.label}`}
                      fields={formFields} initial={r.values} options={options}
                      action={saveMasterAction.bind(null, kind, r.id)} successMessage={`${def.label} updated.`}
                    />
                  )}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {columns.slice(1).map((c) => (
                    <div key={c.name}>
                      <dt className="text-muted">{c.label}</dt>
                      <dd className="num">{r.cells[c.name] || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
