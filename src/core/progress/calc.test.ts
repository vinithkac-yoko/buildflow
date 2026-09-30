import { describe, expect, it } from "vitest";
import { actualPct, daysAheadBehind, plannedFraction, plannedPct, scheduleBand, weightMethod, type PlanActivity } from "./calc";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const act = (over: Partial<PlanActivity>): PlanActivity => ({
  id: "a", cost: 100, mandays: 10, plannedQty: 100, actualQty: 0, start: d("2026-01-01"), finish: d("2026-01-10"), ...over,
});

describe("plannedFraction", () => {
  it("is 0 before start and 1 from the finish date onward", () => {
    const a = act({});
    expect(plannedFraction(a, d("2025-12-31"))).toBe(0);
    expect(plannedFraction(a, d("2026-01-10"))).toBe(1);
    expect(plannedFraction(a, d("2026-02-01"))).toBe(1);
  });
  it("interpolates linearly between start and finish", () => {
    const a = act({});
    expect(plannedFraction(a, d("2026-01-05"))).toBeCloseTo(0.5, 5);
  });
});

describe("weighting", () => {
  it("weights by planned cost", () => {
    const acts = [act({ id: "big", cost: 900, actualQty: 100 }), act({ id: "small", cost: 100, actualQty: 0 })];
    expect(actualPct(acts)).toBeCloseTo(90, 5);
  });
  it("falls back to mandays when cost is hidden (0)", () => {
    const acts = [act({ id: "a", cost: 0, mandays: 30, actualQty: 100 }), act({ id: "b", cost: 0, mandays: 10, actualQty: 0 })];
    expect(weightMethod(acts)).toBe("mandays");
    expect(actualPct(acts)).toBeCloseTo(75, 5);
  });
  it("falls back to equal weights when nothing else is known", () => {
    const acts = [act({ cost: 0, mandays: 0, actualQty: 100 }), act({ id: "b", cost: 0, mandays: 0, actualQty: 50 })];
    expect(weightMethod(acts)).toBe("equal");
    expect(actualPct(acts)).toBeCloseTo(75, 5);
  });
  it("caps an activity at 100% even when overrun is recorded", () => {
    expect(actualPct([act({ actualQty: 130 })])).toBe(100);
  });
});

describe("days ahead / behind", () => {
  const acts = [act({ start: d("2026-01-01"), finish: d("2026-01-20"), actualQty: 0 })];
  it("is behind by the days since the plan reached today's progress", () => {
    // 50% done; the plan reached 50% on Jan 10; today is Jan 15 → 5 days behind.
    const half = [{ ...acts[0], actualQty: 50 }];
    expect(daysAheadBehind(half, d("2026-01-15"))).toBe(-5);
  });
  it("is ahead when actual is ahead of the plan", () => {
    const most = [{ ...acts[0], actualQty: 80 }];
    expect(daysAheadBehind(most, d("2026-01-10"))).toBeGreaterThan(0);
  });
  it("is 0 when nothing is due yet", () => {
    expect(daysAheadBehind(acts, d("2025-12-15"))).toBe(0);
  });
  it("is plain-behind when nothing is done after the start date", () => {
    expect(daysAheadBehind(acts, d("2026-01-11"))).toBeLessThan(0);
  });
});

describe("schedule band", () => {
  it("classifies by the percentage-point gap", () => {
    expect(scheduleBand(60, 50)).toBe("AHEAD");
    expect(scheduleBand(50, 50)).toBe("ON_TRACK");
    expect(scheduleBand(45, 50)).toBe("SLIGHTLY_BEHIND");
    expect(scheduleBand(30, 50)).toBe("BEHIND");
    expect(scheduleBand(0, 0)).toBe("NOT_STARTED");
  });
});

describe("plannedPct", () => {
  it("is 100 after every activity finishes", () => {
    expect(plannedPct([act({}), act({ id: "b", cost: 50 })], d("2026-06-01"))).toBeCloseTo(100, 5);
  });
});
