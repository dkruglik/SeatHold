import { describe, expect, it } from "vitest";
import { assertSeatCapNotExceeded, holdExpiresAt, isExpired } from "./hold-rules.js";
import { HoldLimitReached } from "./errors.js";

const now = new Date("2026-01-01T12:00:00.000Z");

describe("holdExpiresAt", () => {
  it("is the clock value plus the hold duration in minutes", () => {
    expect(holdExpiresAt(now, 10)).toEqual(new Date("2026-01-01T12:10:00.000Z"));
  });
});

describe("isExpired", () => {
  it("at exactly expires_at the hold is expired", () => {
    expect(isExpired(now, now)).toBe(true);
  });

  it("one second before expires_at the hold is not expired", () => {
    expect(isExpired(new Date(now.getTime() + 1000), now)).toBe(false);
  });
});

describe("assertSeatCapNotExceeded", () => {
  it("allows the seat that reaches the cap", () => {
    expect(() => assertSeatCapNotExceeded(9, 10)).not.toThrow();
  });

  it("rejects a seat beyond the cap with HoldLimitReached", () => {
    expect(() => assertSeatCapNotExceeded(10, 10)).toThrow(HoldLimitReached);
  });
});
