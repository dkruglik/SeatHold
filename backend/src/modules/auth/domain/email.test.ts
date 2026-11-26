import { describe, expect, it } from "vitest";
import { emailsEqual, normalizeEmail } from "./email.js";

describe("email", () => {
  it("trims surrounding whitespace and keeps the case the user typed", () => {
    expect(normalizeEmail("  Ada@Example.io \n")).toBe("Ada@Example.io");
  });

  it("compares addresses without regard to case or surrounding whitespace", () => {
    expect(emailsEqual("A@x.io", " a@X.io ")).toBe(true);
    expect(emailsEqual("a@x.io", "b@x.io")).toBe(false);
  });
});
