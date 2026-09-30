import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import type { Ctx } from "../types";
import { ALL_PROJECT_ROLES, assertCan, can, redact } from "./permissions";

const ctxFor = (role: Role, projectIds: string[] = []): Ctx => ({
  userId: `u-${role}`,
  role,
  projectIds,
  allProjects: ALL_PROJECT_ROLES.includes(role),
  clientId: role === "CLIENT" ? "c1" : null,
  now: new Date("2026-09-29T00:00:00Z"),
});

describe("can()", () => {
  it("lets the Owner do everything on any project", () => {
    const owner = ctxFor("OWNER");
    expect(can(owner, "approve", "dpr", "p1")).toBe(true);
    expect(can(owner, "delete", "user")).toBe(true);
  });

  it("limits a Site Engineer to assigned projects", () => {
    const se = ctxFor("SITE_ENGINEER", ["p1"]);
    expect(can(se, "read", "project", "p1")).toBe(true);
    expect(can(se, "read", "project", "p2")).toBe(false);
  });

  it("denies actions the role never has, even on an assigned project", () => {
    const se = ctxFor("SITE_ENGINEER", ["p1"]);
    expect(can(se, "approve", "dpr", "p1")).toBe(false);
    expect(can(se, "read", "invoice", "p1")).toBe(false);
    expect(can(se, "read", "audit")).toBe(false);
  });

  it("lets a PM approve DPRs only on assigned projects", () => {
    const pm = ctxFor("PROJECT_MANAGER", ["p1"]);
    expect(can(pm, "approve", "dpr", "p1")).toBe(true);
    expect(can(pm, "approve", "dpr", "p2")).toBe(false);
  });

  it("gives Marketing clients only, and no project data", () => {
    const m = ctxFor("MARKETING");
    expect(can(m, "create", "client")).toBe(true);
    expect(can(m, "read", "project")).toBe(false);
  });

  it("lets Admin read the audit log but not see cost resources", () => {
    const admin = ctxFor("ADMIN");
    expect(can(admin, "read", "audit")).toBe(true);
    expect(can(admin, "read", "invoice")).toBe(false);
  });

  it("makes the Client read-only", () => {
    const c = ctxFor("CLIENT", ["p1"]);
    expect(can(c, "read", "dpr", "p1")).toBe(true);
    expect(can(c, "create", "dpr", "p1")).toBe(false);
    expect(can(c, "update", "project", "p1")).toBe(false);
  });

  it("assertCan throws a friendly forbidden error", () => {
    expect(() => assertCan(ctxFor("SITE_ENGINEER", ["p1"]), "read", "invoice")).toThrow(/don't have access/);
  });
});

describe("redact()", () => {
  const project = {
    id: "p1",
    name: "Villa",
    contractValue: "34000000.00",
    boq: [{ id: "b1", projectId: "p1", clientRate: "1200", internalBudgetRate: "900", description: "PCC" }],
    activity: { plannedCost: "500000", name: "Footing", labourCost: "12000" },
    created: new Date("2026-01-01T00:00:00Z"),
  };

  it("never sends internal budget or cost fields to a Site Engineer", () => {
    const out = redact(ctxFor("SITE_ENGINEER", ["p1"]), project, "p1");
    const text = JSON.stringify(out);
    for (const k of ["internalBudgetRate", "plannedCost", "labourCost", "contractValue", "clientRate"]) {
      expect(text).not.toContain(k);
    }
    expect(out.name).toBe("Villa");
    expect(out.boq[0].description).toBe("PCC");
  });

  it("gives a Client contract value and client rate but never internal budget or cost", () => {
    const out = redact(ctxFor("CLIENT", ["p1"]), project, "p1");
    const text = JSON.stringify(out);
    expect(text).toContain("contractValue");
    expect(text).toContain("clientRate");
    expect(text).not.toContain("internalBudgetRate");
    expect(text).not.toContain("plannedCost");
    expect(text).not.toContain("labourCost");
  });

  it("strips cost data from Admin (Admin cannot see costs)", () => {
    const text = JSON.stringify(redact(ctxFor("ADMIN"), project, "p1"));
    expect(text).not.toContain("internalBudgetRate");
    expect(text).not.toContain("contractValue");
  });

  it("gives the Owner everything", () => {
    const out = redact(ctxFor("OWNER"), project, "p1");
    expect(out.boq[0]).toHaveProperty("internalBudgetRate");
    expect(out.contractValue).toBe("34000000.00");
  });

  it("limits PM cost visibility to assigned projects", () => {
    const pm = ctxFor("PROJECT_MANAGER", ["p1"]);
    expect(JSON.stringify(redact(pm, project, "p1"))).toContain("internalBudgetRate");
    const other = { ...project, id: "p2", boq: [{ ...project.boq[0], projectId: "p2" }] };
    expect(JSON.stringify(redact(pm, other, "p2"))).not.toContain("internalBudgetRate");
  });

  it("shows PO rates to Procurement only among non-cost roles", () => {
    const po = { id: "po1", projectId: "p1", poRate: "100", labourCost: "5" };
    const out = redact(ctxFor("PROCUREMENT"), po, "p1");
    expect(out).toHaveProperty("poRate");
    expect(out).not.toHaveProperty("labourCost");
  });

  it("leaves Dates and non-plain objects untouched", () => {
    const out = redact(ctxFor("SITE_ENGINEER", ["p1"]), project, "p1");
    expect(out.created).toBeInstanceOf(Date);
  });
});
