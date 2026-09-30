import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("blocks after the max attempts and recovers after the window", () => {
    const k = "t:" + Math.random();
    for (let i = 0; i < 3; i++) expect(rateLimit(k, 3, 1000, 1000 + i).ok).toBe(true);
    expect(rateLimit(k, 3, 1000, 1500).ok).toBe(false);
    expect(rateLimit(k, 3, 1000, 2500).ok).toBe(true);
  });
});
