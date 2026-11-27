import { describe, expect, it } from "vitest";
import { InvalidSeatRelease } from "./errors.js";
import { parseReleaseReason, REASON_MAX, REASON_MIN } from "./release-rules.js";

describe("parseReleaseReason", () => {
  it("returns the reason trimmed", () => {
    expect(parseReleaseReason("  Buyer called, abandoned checkout  ")).toBe("Buyer called, abandoned checkout");
  });

  it("accepts exactly the minimum and the maximum length after trimming", () => {
    expect(parseReleaseReason(` ${"a".repeat(REASON_MIN)} `)).toHaveLength(REASON_MIN);
    expect(parseReleaseReason(`${"a".repeat(REASON_MAX)}  `)).toHaveLength(REASON_MAX);
  });

  it.each([["too short", "ab"], ["only spaces", "      "], ["short once trimmed", "  ab  "], ["too long", "a".repeat(REASON_MAX + 1)], ["not a string", 42]])(
    "rejects a reason that is %s with INVALID_RELEASE_REASON and does not echo the value",
    (_name, value) => {
      let caught: unknown;
      try {
        parseReleaseReason(value as string);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(InvalidSeatRelease);
      expect((caught as InvalidSeatRelease).publicCode).toBe("INVALID_RELEASE_REASON");
      expect((caught as Error).message).not.toContain(String(value).trim() || "never-empty");
    },
  );
});
