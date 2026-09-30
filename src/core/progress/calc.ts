import { DAY_MS, addDays, dateKey } from "../dates";

/**
 * Progress maths (decision 13): actual % is quantity-weighted by each activity's planned cost, falling back to
 * planned mandays when cost is zero or unavailable. Planned % interpolates each activity linearly between its
 * planned start and finish dates. Everything here is pure; callers pass plain numbers.
 */

export interface PlanActivity {
  id: string;
  /** Planned cost (₹). May be 0 when the caller is not allowed to see it — then mandays are used. */
  cost: number;
  mandays: number;
  plannedQty: number;
  actualQty: number;
  start: Date;
  finish: Date;
}

export type WeightMethod = "cost" | "mandays" | "equal";

/** Which weight to use for this set of activities (cost → mandays → equal). */
export function weightMethod(acts: readonly PlanActivity[]): WeightMethod {
  if (acts.some((a) => a.cost > 0)) return "cost";
  if (acts.some((a) => a.mandays > 0)) return "mandays";
  return "equal";
}

function weights(acts: readonly PlanActivity[]): number[] {
  const m = weightMethod(acts);
  return acts.map((a) => (m === "cost" ? a.cost : m === "mandays" ? a.mandays : 1));
}

/** Fraction of an activity's planned work that should be done by the end of `at` (0..1). */
export function plannedFraction(a: Pick<PlanActivity, "start" | "finish">, at: Date): number {
  if (at < a.start) return 0;
  if (at >= a.finish) return 1;
  const span = (a.finish.getTime() - a.start.getTime()) / DAY_MS + 1;
  const elapsed = (at.getTime() - a.start.getTime()) / DAY_MS + 1;
  return Math.min(1, Math.max(0, elapsed / span));
}

export function actualFraction(a: Pick<PlanActivity, "plannedQty" | "actualQty">): number {
  if (a.plannedQty <= 0) return 0;
  return Math.min(1, Math.max(0, a.actualQty / a.plannedQty));
}

function weighted(acts: readonly PlanActivity[], f: (a: PlanActivity) => number): number {
  if (acts.length === 0) return 0;
  const w = weights(acts);
  const total = w.reduce((s, x) => s + x, 0);
  if (total <= 0) return 0;
  return (acts.reduce((s, a, i) => s + w[i] * f(a), 0) / total) * 100;
}

/** Planned % complete on date `at` (0..100). */
export const plannedPct = (acts: readonly PlanActivity[], at: Date) => weighted(acts, (a) => plannedFraction(a, at));

/** Actual % complete from cumulative approved quantities (0..100). */
export const actualPct = (acts: readonly PlanActivity[]) => weighted(acts, actualFraction);

/**
 * Days ahead (+) or behind (−) plan: the date on which the plan reached today's actual %, compared with today.
 * Behind by 12 days means the plan expected today's progress 12 days ago.
 */
export function daysAheadBehind(acts: readonly PlanActivity[], today: Date): number {
  if (acts.length === 0) return 0;
  const actual = actualPct(acts);
  const first = new Date(Math.min(...acts.map((a) => a.start.getTime())));
  const last = new Date(Math.max(...acts.map((a) => a.finish.getTime())));
  if (actual <= 0) {
    // Nothing done yet: behind by the days since the plan said work should have begun (0 if not due yet).
    return today > first ? -Math.round((today.getTime() - first.getTime()) / DAY_MS) : 0;
  }
  if (actual >= 99.999) return 0;
  // Planned % is non-decreasing in time: find the first day the plan reaches `actual`.
  let lo = addDays(first, -1);
  let hi = last;
  if (plannedPct(acts, hi) < actual) return Math.round((today.getTime() - last.getTime()) / DAY_MS) * -1;
  while ((hi.getTime() - lo.getTime()) / DAY_MS > 1) {
    const mid = new Date(lo.getTime() + Math.floor((hi.getTime() - lo.getTime()) / DAY_MS / 2) * DAY_MS);
    if (plannedPct(acts, mid) >= actual) hi = mid;
    else lo = mid;
  }
  return Math.round((hi.getTime() - today.getTime()) / DAY_MS);
}

export type ScheduleBand = "AHEAD" | "ON_TRACK" | "SLIGHTLY_BEHIND" | "BEHIND" | "NOT_STARTED";

/** Schedule health from the gap between actual and planned % (percentage points). */
export function scheduleBand(actual: number, planned: number): ScheduleBand {
  if (planned < 0.5 && actual < 0.5) return "NOT_STARTED";
  const gap = actual - planned;
  if (gap >= 3) return "AHEAD";
  if (gap > -3) return "ON_TRACK";
  if (gap > -8) return "SLIGHTLY_BEHIND";
  return "BEHIND";
}

export interface CurvePoint { date: string; planned: number; actual: number }

/**
 * Cumulative planned vs actual % over time for the S-curve. `cumulative` maps activityId → list of
 * (date, cumulative approved qty) points sorted by date; actual at a date uses the last point on or before it.
 */
export function buildSCurve(
  acts: readonly PlanActivity[],
  cumulative: ReadonlyMap<string, ReadonlyArray<{ date: Date; qty: number }>>,
  from: Date,
  to: Date,
  stepDays: number,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  const cursor = new Map<string, number>();
  for (let t = from.getTime(); t <= to.getTime() + 1; t += stepDays * DAY_MS) {
    const at = new Date(Math.min(t, to.getTime()));
    const snapshot = acts.map((a) => {
      const series = cumulative.get(a.id) ?? [];
      let i = cursor.get(a.id) ?? 0;
      while (i < series.length && series[i].date <= at) i++;
      cursor.set(a.id, i);
      return { ...a, actualQty: i > 0 ? series[i - 1].qty : 0 };
    });
    points.push({ date: dateKey(at), planned: round1(plannedPct(snapshot, at)), actual: round1(actualPct(snapshot)) });
    if (at.getTime() === to.getTime()) break;
  }
  return points;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
