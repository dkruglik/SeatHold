import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors/app-error.js";
import { assertOffsetWithinLimit } from "./offset-limit.js";

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
