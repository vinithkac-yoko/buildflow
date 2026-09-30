import { describe, expect, it } from "vitest";
import { BOQ_EXTRAS, COST_CODES, MATERIALS, TEMPLATE, TRADES, UOMS } from "./data";
import { PROJECTS } from "./seed";

describe("demo data is internally consistent", () => {
  const materials = new Set(MATERIALS.map((m) => m[0]));
  const uoms = new Set(UOMS.map((u) => u[0]));
  const trades = new Set(TRADES);
  const costCodes = new Set(COST_CODES.map((c) => c[0]));

  it("every template row points at real masters", () => {
    for (const r of TEMPLATE) {
      expect(uoms.has(r.uom), `${r.name} uom ${r.uom}`).toBe(true);
      expect(trades.has(r.trade), `${r.name} trade ${r.trade}`).toBe(true);
      expect(costCodes.has(r.cc), `${r.name} cost code ${r.cc}`).toBe(true);
      for (const [m] of r.mats) expect(materials.has(m), `${r.name} material ${m}`).toBe(true);
    }
    for (const m of MATERIALS) expect(uoms.has(m[2]), `material ${m[0]} uom`).toBe(true);
    for (const x of BOQ_EXTRAS) expect(uoms.has(x.uom)).toBe(true);
  });

  it("phases are ordered inside 0..1 and there are about 25 activities", () => {
    expect(TEMPLATE.length).toBeGreaterThanOrEqual(24);
    expect(TEMPLATE.length).toBeLessThanOrEqual(28);
    for (const r of TEMPLATE) {
      expect(r.ph[0]).toBeGreaterThanOrEqual(0);
      expect(r.ph[1]).toBeLessThanOrEqual(1);
      expect(r.ph[1]).toBeGreaterThan(r.ph[0]);
    }
  });

  it("linked BOQ extras name a real activity", () => {
    const names = new Set(TEMPLATE.map((r) => r.name));
    for (const x of BOQ_EXTRAS) if (x.linkActivity) expect(names.has(x.linkActivity)).toBe(true);
  });

  it("has 9 projects: 3 PMs with 3 each, one engineer per active project", () => {
    expect(PROJECTS).toHaveLength(9);
    for (const pm of [1, 2, 3]) expect(PROJECTS.filter((p) => p.pm === pm)).toHaveLength(3);
    const active = PROJECTS.filter((p) => p.status === "ACTIVE");
    expect(active).toHaveLength(7);
    expect(new Set(active.map((p) => p.engineer)).size).toBe(7);
    expect(PROJECTS.every((p) => p.valueCr >= 2)).toBe(true);
  });
});
