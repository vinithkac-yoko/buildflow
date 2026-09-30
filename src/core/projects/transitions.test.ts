import { describe, expect, it } from "vitest";
import { canTransition } from "./transitions";
import { canTransitionActivity } from "../planning/transitions";

describe("project transitions", () => {
  it("allows the normal life-cycle", () => {
    expect(canTransition("PLANNING", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "ON_HOLD")).toBe(true);
    expect(canTransition("ON_HOLD", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "COMPLETED")).toBe(true);
  });
  it("refuses illegal jumps and leaving a final state", () => {
    expect(canTransition("PLANNING", "COMPLETED")).toBe(false);
    expect(canTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransition("CANCELLED", "PLANNING")).toBe(false);
  });
  it("treats staying put as a no-op", () => {
    expect(canTransition("ACTIVE", "ACTIVE")).toBe(true);
  });
});

describe("activity transitions", () => {
  it("follows NOT_STARTED → IN_PROGRESS → COMPLETED, with halt/resume and reopen", () => {
    expect(canTransitionActivity("NOT_STARTED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionActivity("IN_PROGRESS", "HALTED")).toBe(true);
    expect(canTransitionActivity("HALTED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionActivity("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransitionActivity("COMPLETED", "IN_PROGRESS")).toBe(true);
  });
  it("refuses skipping steps", () => {
    expect(canTransitionActivity("NOT_STARTED", "COMPLETED")).toBe(false);
    expect(canTransitionActivity("HALTED", "COMPLETED")).toBe(false);
  });
});
