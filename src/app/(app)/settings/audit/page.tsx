import { listAuditLogs } from "@/core/audit-view";
import { can } from "@/core/auth/permissions";
import { NoAccess } from "@/components/no-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const selectCls = "min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-[15px]";

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "audit")) return <NoAccess message="Only the Owner and Admin can view the audit log." />;

  const sp = await searchParams;
  const filter = {
    projectId: one(sp.project), userId: one(sp.user), entity: one(sp.entity), from: one(sp.from), to: one(sp.to),
  };
  const { rows, projects, users, entities } = await listAuditLogs(ctx, filter);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl">Audit log</h1>
        <p className="text-muted">Latest {rows.length} entries matching your filters.</p>
      </div>

      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
          <label className="block text-sm">Project
            <select name="project" defaultValue={filter.projectId ?? ""} className={selectCls}>
              <option value="">All</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">User
            <select name="user" defaultValue={filter.userId ?? ""} className={selectCls}>
              <option value="">All</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Entity
            <select name="entity" defaultValue={filter.entity ?? ""} className={selectCls}>
              <option value="">All</option>
              {entities.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label className="block text-sm">From
            <input type="date" name="from" defaultValue={filter.from ?? ""} className={selectCls} />
          </label>
          <label className="block text-sm">To
            <input type="date" name="to" defaultValue={filter.to ?? ""} className={selectCls} />
          </label>
          <div className="flex items-end"><Button type="submit" className="w-full">Apply filters</Button></div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card><p className="font-medium">No entries match these filters.</p><p className="text-muted">Clear a filter to see more.</p></Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="panel p-3 md:p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="code text-muted">{formatDateTime(r.createdAt)}</span>
                <span className="font-semibold">{r.action}</span>
                <span className="code">{r.entity}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</span>
                <span className="text-muted">{r.user ? r.user.name : "System"}</span>
              </div>
              {(r.before || r.after) && (
                <pre className="code mt-2 overflow-x-auto rounded-lg bg-bg p-2 text-xs text-muted">
                  {JSON.stringify({ before: r.before ?? undefined, after: r.after ?? undefined }, null, 1)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
