import { describe, expect, it } from "vitest";
import { emailsEqual, isValidEmail, normalizeEmail } from "./email.js";

describe("email", () => {
  it("trims surrounding whitespace and keeps the case the user typed", () => {
    expect(normalizeEmail("  Ada@Example.io \n")).toBe("Ada@Example.io");
  });

  it("compares addresses without regard to case or surrounding whitespace", () => {
    expect(emailsEqual("A@x.io", " a@X.io ")).toBe(true);
    expect(emailsEqual("a@x.io", "b@x.io")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it.each(["a@x.io", "first.last+tag@mail.example.com", " a@x.io "])("accepts %s", (value) => {
    expect(isValidEmail(value)).toBe(true);
  });

  it.each(["", "plain", "a@", "@x.io", "a b@x.io", "a@x", "a@@x.io", "a@x..io", `${"a".repeat(250)}@x.io`])("rejects %j", (value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});
