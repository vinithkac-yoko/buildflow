import type { TemplateRow } from "./data";

/**
 * Helpers for the demo seed. A project's work follows the template's phase windows: activity i is complete
 * (fraction 0..1) at "work front" f as clamp((f − start_i) / (finish_i − start_i)). Planned progress uses the
 * calendar fraction t as the front; actual progress uses a front f that can run ahead of or behind t. Solving for
 * the front that yields a target % lets the seed produce exactly the ahead / on-track / behind mix the demo needs.
 */

export const completion = (r: Pick<TemplateRow, "ph">, front: number): number => {
  const [a, b] = r.ph;
  return Math.min(1, Math.max(0, (front - a) / (b - a)));
};

export function overallPct(rows: readonly TemplateRow[], front: number): number {
  const total = rows.reduce((s, r) => s + r.share, 0);
  return (rows.reduce((s, r) => s + r.share * completion(r, front), 0) / total) * 100;
}

/** The work front at which overall progress equals `targetPct` (bisection; progress is non-decreasing in the front). */
export function solveFront(rows: readonly TemplateRow[], targetPct: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (overallPct(rows, mid) < targetPct) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Small deterministic PRNG so the demo looks the same every time it is seeded. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
