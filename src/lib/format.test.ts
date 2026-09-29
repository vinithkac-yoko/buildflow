import { describe, expect, it } from "vitest";
import { formatDate, formatInr } from "./format";

describe("Indian formatting", () => {
  it("formats crore and lakh", () => {
    expect(formatInr("24500000")).toBe("₹2.45 Cr");
    expect(formatInr(3.4e7)).toBe("₹3.4 Cr");
    expect(formatInr(250000)).toBe("₹2.5 L");
    expect(formatInr(98500)).toBe("₹98,500");
  });
  it("formats dates as DD-MMM-YYYY", () => {
    expect(formatDate(new Date("2026-09-05T00:00:00Z"))).toBe("05-Sep-2026");
  });
});
