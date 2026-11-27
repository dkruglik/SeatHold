import { describe, expect, it } from "vitest";
import { AppError, GoneError } from "../../../shared/errors/app-error.js";
import { LinkExpired, LinkInvalid, LinkUsed, guestLinkErrorFor } from "./errors.js";

describe("guest access errors", () => {
  it.each([
    [new LinkUsed(), "LINK_USED"],
    [new LinkExpired(), "LINK_EXPIRED"],
    [new LinkInvalid(), "LINK_INVALID"],
  ])("%s is a GoneError (410) with a stable code", (error, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(GoneError);
    expect(error.kind).toBe("gone");
    expect(error.publicCode).toBe(code);
    expect(error.name).toBe(error.constructor.name);
  });

  it.each([
    ["used", LinkUsed],
    ["expired", LinkExpired],
    ["invalidated", LinkInvalid],
    ["unknown", LinkInvalid],
  ] as const)("a %s link state maps to %o", (state, ErrorClass) => {
    expect(guestLinkErrorFor(state)).toBeInstanceOf(ErrorClass);
  });
});
