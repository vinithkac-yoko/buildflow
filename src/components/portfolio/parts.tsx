import { CheckCircle2, CircleDashed, CircleAlert, OctagonAlert, TriangleAlert, TrendingUp, type LucideIcon } from "lucide-react";
import type { HealthBand, ProjectProgress } from "@/core/progress/service";
import type { ScheduleBand } from "@/core/progress/calc";
import { cn } from "@/lib/utils";

/** Text + icon + colour for a schedule band. Colour is never the only signal. */
export const BAND: Record<ScheduleBand, { label: string; icon: LucideIcon; text: string }> = {
  AHEAD: { label: "Ahead", icon: TrendingUp, text: "text-brand-text" },
  ON_TRACK: { label: "On track", icon: CheckCircle2, text: "text-brand-text" },
  SLIGHTLY_BEHIND: { label: "Slightly behind", icon: CircleAlert, text: "text-warn" },
  BEHIND: { label: "Behind", icon: OctagonAlert, text: "text-danger" },
  NOT_STARTED: { label: "Not started", icon: CircleDashed, text: "text-muted" },
};

export function BandChip({ band }: { band: ScheduleBand }) {
  const b = BAND[band];
  const Icon = b.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", b.text)}>
      <Icon className="h-4 w-4" aria-hidden /> {b.label}
    </span>
  );
}

/** Thin dual bar: planned (steel blue, dashed look) above, actual (brand green, solid, glowing edge) below. Labels are always visible. */
export function DualBar({ planned, actual, label }: { planned: number; actual: number; label?: string }) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <div>
      <div className="space-y-1" role="img" aria-label={`${label ?? "Progress"}: planned ${planned} percent, actual ${actual} percent`}>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full origin-left animate-bar-grow rounded-full"
            style={{ width: `${clamp(planned)}%`, backgroundImage: "repeating-linear-gradient(90deg, rgb(var(--planned)) 0 6px, transparent 6px 9px)" }}
          />
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full origin-left animate-bar-grow rounded-full bg-brand dark:shadow-[0_0_10px_rgb(var(--brand)/0.7)]"
            style={{ width: `${clamp(actual)}%` }}
          />
        </div>
      </div>
      <div className="num mt-1 flex justify-between text-sm">
        <span className="text-planned">Plan <span className="font-semibold">{planned}%</span></span>
        <span className="text-brand-text">Actual <span className="font-semibold">{actual}%</span></span>
      </div>
    </div>
  );
}

const HEALTH: Record<HealthBand, { label: string; icon: LucideIcon; border: string; text: string }> = {
  HEALTHY: { label: "Healthy", icon: CheckCircle2, border: "border-brand-text/40", text: "text-brand-text" },
  WATCH: { label: "Watch", icon: TriangleAlert, border: "border-warn/50", text: "text-warn" },
  AT_RISK: { label: "At risk", icon: OctagonAlert, border: "border-danger/50", text: "text-danger" },
};

/** Score and band as one chip (icon + number + word). The formula is on the chip's title and in the "How health is scored" tip. */
export function HealthChip({ score, band, tip }: { score: number; band: HealthBand; tip: string }) {
  const h = HEALTH[band];
  const Icon = h.icon;
  return (
    <span title={tip} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold", h.border, h.text)} >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">Health score</span>
      <span className="num">{score}</span>
      <span className="font-medium">{h.label}</span>
    </span>
  );
}

/** The four parts of the health score, each as points out of its maximum. */
export function HealthBreakdown({ h }: { h: NonNullable<ProjectProgress["health"]> }) {
  const parts: [string, number, number][] = [["Schedule", h.schedule, 50], ["Quality (open NCRs)", h.ncr, 20], ["Open critical issues", h.issues, 15], ["Daily reports, last 7 days", h.compliance, 15]];
  return (
    <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2" aria-label="How the health score is made up">
      {parts.map(([label, got, max]) => (
        <li key={label}>
          <div className="flex justify-between text-sm"><span>{label}</span><span className="num font-semibold">{got}<span className="font-normal text-muted"> / {max}</span></span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${label}: ${got} of ${max} points`}>
            <div className={cn("h-full rounded-full", got >= max ? "bg-brand" : got >= max * 0.5 ? "bg-warn" : "bg-danger")} style={{ width: `${Math.round((got / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Hover / focus explanation without JavaScript. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={label} className="grid h-11 w-11 cursor-help place-items-center text-muted hover:text-text"><span className="grid h-6 w-6 place-items-center rounded-full border border-border text-xs font-bold" aria-hidden>i</span></button>
      <span role="tooltip" className="glass pointer-events-none absolute left-1/2 top-full z-40 mt-1 hidden w-72 -translate-x-1/2 rounded-xl border border-border p-3 text-left text-sm font-normal normal-case tracking-normal text-text shadow-xl group-focus-within:block group-hover:block">
        {children}
      </span>
    </span>
  );
}

export const rank = (p: ProjectProgress) => {
  const order: Record<ScheduleBand, number> = { BEHIND: 0, SLIGHTLY_BEHIND: 1, NOT_STARTED: 3, ON_TRACK: 2, AHEAD: 2 };
  return order[p.band] * 1000 - (p.plannedPct - p.actualPct);
};
