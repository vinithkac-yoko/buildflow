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

const HEALTH: Record<HealthBand, { label: string; icon: LucideIcon; stroke: string; text: string }> = {
  HEALTHY: { label: "Healthy", icon: CheckCircle2, stroke: "rgb(var(--brand-text))", text: "text-brand-text" },
  WATCH: { label: "Watch", icon: TriangleAlert, stroke: "rgb(var(--warn))", text: "text-warn" },
  AT_RISK: { label: "At risk", icon: OctagonAlert, stroke: "rgb(var(--danger))", text: "text-danger" },
};

/** Circular gauge with the score inside, plus an icon-and-word chip beneath. */
export function HealthRing({ score, band, tip }: { score: number; band: HealthBand; tip: string }) {
  const h = HEALTH[band];
  const Icon = h.icon;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1" title={tip}>
      <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90" role="img" aria-label={`Health score ${score} out of 100, ${h.label}`}>
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth="5" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={h.stroke} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
        <text x="24" y="24" transform="rotate(90 24 24)" textAnchor="middle" dominantBaseline="central" className="num" fontSize="14" fontWeight="600" fill="rgb(var(--text))">{score}</text>
      </svg>
      <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", h.text)}><Icon className="h-3.5 w-3.5" aria-hidden />{h.label}</span>
    </div>
  );
}

/** Hover / focus explanation without JavaScript. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={label} className="grid h-6 w-6 place-items-center rounded-full border border-border text-xs font-bold text-muted hover:text-text cursor-help">i</button>
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
