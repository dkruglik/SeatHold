import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/errors/app-error.js";
import { GuestEmailInvalid } from "./errors.js";
import { parseGuestEmail } from "./guest-email.js";

describe("parseGuestEmail", () => {
  it("returns a trimmed valid address", () => {
    expect(parseGuestEmail("  Fan@Example.com ")).toBe("Fan@Example.com");
  });

  it.each([undefined, "", "   ", "no-at-sign", "a@b", "a b@c.de", "@c.de", "a@@c.de", `${"x".repeat(250)}@c.de`])(
    "rejects %j with a validation error",
    (value) => {
      expect(() => parseGuestEmail(value)).toThrow(GuestEmailInvalid);
      try {
        parseGuestEmail(value);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as GuestEmailInvalid).publicCode).toBe("GUEST_EMAIL_INVALID");
      }
    },
  );
});
