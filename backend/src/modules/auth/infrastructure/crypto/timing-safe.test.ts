import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeEqualHex } from "./timing-safe.js";

afterEach(() => vi.restoreAllMocks());

describe("safeEqualHex", () => {
  it("compares through crypto.timingSafeEqual", () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");

    expect(safeEqualHex("ab12", "ab12")).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("is false for different values", () => {
    expect(safeEqualHex("ab12", "ab13")).toBe(false);
  });

  it("is false for different lengths without throwing", () => {
    expect(safeEqualHex("ab12", "ab1234")).toBe(false);
    expect(safeEqualHex("", "ab")).toBe(false);
  });
});
