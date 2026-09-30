import { describe, expect, it } from "vitest";
import { TEMPLATE } from "./data";
import { overallPct, rng, solveFront } from "./solver";

describe("demo solver", () => {
  it("finds the work front for a target percentage", () => {
    for (const target of [5, 20, 45, 70, 85]) {
      expect(overallPct(TEMPLATE, solveFront(TEMPLATE, target))).toBeCloseTo(target, 1);
    }
  });
  it("progress is monotone in the front", () => {
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const p = overallPct(TEMPLATE, f);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(overallPct(TEMPLATE, 1)).toBeCloseTo(100, 5);
  });
  it("the PRNG is deterministic", () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
