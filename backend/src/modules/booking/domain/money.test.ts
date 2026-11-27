import { describe, expect, it } from "vitest";
import { money, totalFor, type Money } from "./money.js";

describe("money", () => {
  it("only money() produces a Money; a plain object literal is a type error", () => {
    // @ts-expect-error an unvalidated literal must not type-check as Money
    const forged: Money = { minor: -1, currency: "usd" };
    const valid: Money = money(5, "EUR");
    expect(forged).toEqual({ minor: -1, currency: "usd" });
    expect(valid).toEqual({ minor: 5, currency: "EUR" });
  });

  it("totals are unit price times seats in minor units", () => {
    expect(totalFor(money(2550, "EUR"), 3)).toEqual({ minor: 7650, currency: "EUR" });
  });

  it("a total for zero seats is zero", () => {
    expect(totalFor(money(2550, "EUR"), 0).minor).toBe(0);
  });

  it.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects minor units %s", (value) => {
    expect(() => money(value, "EUR")).toThrow();
  });

  it.each(["eur", "EU", "EURO", "E1R", ""])("rejects currency %j", (value) => {
    expect(() => money(100, value)).toThrow();
  });

  it.each([-1, 1.5])("rejects seat count %s", (count) => {
    expect(() => totalFor(money(100, "EUR"), count)).toThrow();
  });

  it("rejects a total beyond the safe integer range", () => {
    expect(() => totalFor(money(Number.MAX_SAFE_INTEGER, "EUR"), 2)).toThrow();
  });
});
