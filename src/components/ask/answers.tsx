import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SeverityChip, NcrStatusChip } from "@/components/quality/status";
import { formatDate } from "@/lib/format";
import type { ASK_QUESTIONS } from "@/core/tools";

type Q = (typeof ASK_QUESTIONS)[number];
type Result<I extends Q["id"]> = Awaited<ReturnType<Extract<Q, { id: I }>["tool"]["run"]>>;

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(n);

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="panel block min-h-14 p-4 hover:bg-surface-2">{children}</Link>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel flex items-start gap-3 p-4">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-text" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

export function BehindAnswer({ result }: { result: Result<"behind"> }) {
  if (result.rows.length === 0) return <Empty>No open activity is 15 or more points behind plan.</Empty>;
  return (
    <ul className="space-y-2">
      {result.rows.map((r) => (
        <Row key={r.activityId} href={`/projects/${r.projectId}/planning/activities/${r.activityId}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{r.activityName}</span>
            <span className="flex items-center gap-2">
              {r.criticalPath && <Badge tone="danger">Critical path</Badge>}
              <Badge tone="warn">{r.behindPoints} points behind</Badge>
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <span className="code">{r.projectCode}</span> {r.projectName} · should be {r.plannedPct}%, is {r.actualPct}% · due {formatDate(r.plannedFinish)}
          </p>
        </Row>
      ))}
    </ul>
  );
}

export function StockAnswer({ result }: { result: Result<"stock"> }) {
  if (result.rows.length === 0) return <Empty>Nothing is at or below its reorder level.</Empty>;
  return (
    <ul className="space-y-2">
      {result.rows.map((r) => (
        <Row key={`${r.projectId}-${r.materialId}`} href={`/projects/${r.projectId}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{r.material}</span>
            <Badge tone={r.quantity <= 0 ? "danger" : "warn"}>{fmt(r.quantity)} {r.unit} left</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted"><span className="code">{r.projectCode}</span> {r.projectName} · reorder at {fmt(r.reorderThreshold)} {r.unit}</p>
        </Row>
      ))}
    </ul>
  );
}

export function NcrAnswer({ result }: { result: Result<"ncr"> }) {
  if (result.rows.length === 0) return <Empty>No open NCRs.</Empty>;
  const fresh = result.rows.filter((n) => n.newThisWeek).length;
  return (
    <>
      <p className="text-sm text-muted">{result.rows.length} open · {fresh} raised in the last 7 days</p>
      <ul className="space-y-2">
        {result.rows.map((n) => (
          <Row key={n.id} href={`/ncr/${n.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="code font-semibold">{n.code}</span> <span className="text-muted">· {n.projectCode}{n.activity ? ` · ${n.activity}` : ""}</span></span>
              <span className="flex flex-wrap items-center gap-2">
                {n.newThisWeek && <Badge tone="plan">New this week</Badge>}
                <SeverityChip severity={n.severity} />
                <NcrStatusChip status={n.status as Parameters<typeof NcrStatusChip>[0]["status"]} />
              </span>
            </div>
            <p className="mt-1 line-clamp-3 text-[16px]">{n.defect}</p>
          </Row>
        ))}
      </ul>
    </>
  );
}

export function LabourAnswer({ result }: { result: Result<"labour"> }) {
  if (result.rows.length === 0) return <Empty>No labour has been reported in the last 7 days.</Empty>;
  const total = result.rows.reduce((s, r) => s + r.mandays, 0);
  return (
    <>
      <p className="text-sm text-muted">{fmt(total)} mandays across {result.rows.length} project{result.rows.length === 1 ? "" : "s"} in the last 7 days</p>
      <ul className="space-y-2">
        {result.rows.map((r) => (
          <Row key={r.projectId} href={`/projects/${r.projectId}`}>
            <div className="flex items-center justify-between gap-3">
              <span><span className="code font-semibold">{r.projectCode}</span> <span className="text-muted">{r.projectName}</span></span>
              <span className="text-xl font-semibold tabular-nums">{fmt(r.mandays)}<span className="ml-1 text-sm font-normal text-muted">mandays</span></span>
            </div>
            <p className="mt-0.5 text-sm text-muted">{r.workers} worker-days on {r.reports} report{r.reports === 1 ? "" : "s"}</p>
          </Row>
        ))}
      </ul>
    </>
  );
}
