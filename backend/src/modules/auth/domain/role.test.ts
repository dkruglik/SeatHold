import { describe, expect, it } from "vitest";
import { isRole } from "./role.js";

describe("isRole", () => {
  it("accepts buyer and admin only", () => {
    expect(isRole("buyer")).toBe(true);
    expect(isRole("admin")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole("")).toBe(false);
  });
});
