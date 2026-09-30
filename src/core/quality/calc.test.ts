import { describe, expect, it } from "vitest";
import { NCR_TRANSITIONS, canTransitionNcr, inspectionResult } from "./calc";

describe("inspection result", () => {
  it("all checkpoints passing is a PASS", () => expect(inspectionResult(10, 10)).toBe("PASS"));
  it("80% or more is a conditional pass", () => {
    expect(inspectionResult(10, 9)).toBe("CONDITIONAL_PASS");
    expect(inspectionResult(10, 8)).toBe("CONDITIONAL_PASS");
    expect(inspectionResult(8, 7)).toBe("CONDITIONAL_PASS");
  });
  it("below 80% is rejected and raises an NCR", () => {
    expect(inspectionResult(10, 7)).toBe("REJECTED_NCR");
    expect(inspectionResult(8, 6)).toBe("REJECTED_NCR");
    expect(inspectionResult(9, 0)).toBe("REJECTED_NCR");
  });
  it("refuses an empty checklist", () => expect(() => inspectionResult(0, 0)).toThrow());
});

describe("NCR life-cycle", () => {
  it("runs Open → Corrective action → Rectification → Reinspection → Closed", () => {
    expect(canTransitionNcr("OPEN", "CORRECTIVE_ACTION")).toBe(true);
    expect(canTransitionNcr("CORRECTIVE_ACTION", "RECTIFICATION")).toBe(true);
    expect(canTransitionNcr("RECTIFICATION", "REINSPECTION")).toBe(true);
    expect(canTransitionNcr("REINSPECTION", "CLOSED")).toBe(true);
  });
  it("a failed reinspection goes back to rectification; nothing skips ahead or leaves CLOSED", () => {
    expect(canTransitionNcr("REINSPECTION", "RECTIFICATION")).toBe(true);
    expect(canTransitionNcr("OPEN", "RECTIFICATION")).toBe(false);
    expect(canTransitionNcr("OPEN", "CLOSED")).toBe(false);
    expect(canTransitionNcr("RECTIFICATION", "CLOSED")).toBe(false);
    expect(NCR_TRANSITIONS.CLOSED).toHaveLength(0);
  });
});
