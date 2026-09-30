import Link from "next/link";
import { Hammer } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { NEXT_STEP } from "@/core/quality/calc";
import { listNcrs } from "@/core/quality/ncr";
import { NcrStatusChip, SeverityChip } from "@/components/quality/status";
import { NoAccess } from "@/components/no-access";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Rework" };

/** The rectification queue: NCRs that are being fixed or are waiting for reinspection. */
export default async function ReworkPage() {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "ncr")) return <NoAccess />;
  const rows = (await listNcrs(ctx, { open: true })).filter((n) => n.status !== "OPEN");
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div><h1 className="text-2xl md:text-3xl">Rework</h1><p className="text-muted">Defects being fixed, and what each one is waiting for.</p></div>
      {rows.length === 0 ? <Card className="flex items-start gap-3"><Hammer className="mt-0.5 h-6 w-6 shrink-0 text-muted" aria-hidden /><p>No rework in progress.</p></Card> : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id}><Link href={`/ncr/${n.id}`} className="panel block p-4 hover:bg-surface-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span><span className="code font-semibold">{n.code}</span> <span className="text-muted">· {n.projectCode}{n.activity ? ` · ${n.activity}` : ""}</span></span><span className="flex gap-2"><SeverityChip severity={n.severity} /><NcrStatusChip status={n.status} /></span></div>
              <p className="mt-1 text-[16px]">{n.defect}</p>
              <p className="mt-0.5 text-sm text-muted">Next: {NEXT_STEP[n.status]}{n.timeLostDays ? ` · ${n.timeLostDays} day${n.timeLostDays === 1 ? "" : "s"} lost so far` : ""}</p>
            </Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
