import { describe, expect, it } from "vitest";
import { RandomLoginCodeGenerator } from "./random-login-code-generator.js";

describe("RandomLoginCodeGenerator", () => {
  it("always returns six digits, zero-padded", () => {
    const generator = new RandomLoginCodeGenerator();
    const codes = Array.from({ length: 2000 }, () => generator.generate());

    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
  });

  it("pads small numbers with leading zeros", () => {
    const generator = new RandomLoginCodeGenerator(() => 42);

    expect(generator.generate()).toBe("000042");
  });

  it("draws from 0 up to 1,000,000 exclusive", () => {
    const bounds: number[] = [];
    new RandomLoginCodeGenerator((max) => {
      bounds.push(max);
      return 0;
    }).generate();

    expect(bounds).toEqual([1_000_000]);
  });

  it("does not repeat the same code every time", () => {
    const generator = new RandomLoginCodeGenerator();

    expect(new Set(Array.from({ length: 50 }, () => generator.generate())).size).toBeGreaterThan(1);
  });
});
