import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors/app-error.js";
import { assertOffsetWithinLimit, lastReachablePage } from "./offset-limit.js";

describe("assertOffsetWithinLimit", () => {
  it("accepts the last allowed offset", () => {
    expect(() => { assertOffsetWithinLimit(10_000, 1, 10_000); }).not.toThrow(); // offset 9999
    expect(() => { assertOffsetWithinLimit(200, 50, 10_000); }).not.toThrow(); // offset 9950
  });

  it("rejects the first disallowed offset with PAGE_TOO_DEEP", () => {
    for (const [page, pageSize] of [[10_001, 1], [201, 50]] as const) {
      expect(() => { assertOffsetWithinLimit(page, pageSize, 10_000); }).toThrow(ValidationError);
      expect(() => { assertOffsetWithinLimit(page, pageSize, 10_000); }).toThrow(expect.objectContaining({ publicCode: "PAGE_TOO_DEEP" }));
    }
  });

  it("always accepts page 1", () => {
    expect(() => { assertOffsetWithinLimit(1, 100, 1); }).not.toThrow();
  });
});

describe("lastReachablePage", () => {
  it("is the last page whose offset is below the limit", () => {
    expect(lastReachablePage(50, 10_000)).toBe(200);
    expect(lastReachablePage(30, 10_000)).toBe(334); // page 334 starts at offset 9,990
    expect(lastReachablePage(1, 10_000)).toBe(10_000);
    expect(lastReachablePage(100, 20_000)).toBe(200);
  });

  it("names a page that assertOffsetWithinLimit accepts, and the next one it rejects", () => {
    for (const pageSize of [1, 7, 30, 50, 100]) {
      const last = lastReachablePage(pageSize, 10_000);
      expect(() => { assertOffsetWithinLimit(last, pageSize, 10_000); }).not.toThrow();
      expect(() => { assertOffsetWithinLimit(last + 1, pageSize, 10_000); }).toThrow(ValidationError);
    }
  });
});
