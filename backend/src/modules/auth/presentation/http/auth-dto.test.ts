import { describe, expect, it } from "vitest";
import { ROLES } from "../../domain/role.js";
import { meSchema } from "./auth-dto.js";

describe("meSchema", () => {
  it("restricts role to the domain roles", () => {
    expect(meSchema.properties.role).toEqual({ type: "string", enum: ["buyer", "admin"] });
    expect(meSchema.properties.role.enum).toEqual([...ROLES]);
  });
});
