import { describe, expect, it } from "vitest";
import { AppError } from "../../../shared/errors/app-error.js";
import { EventNotFound, GuestEmailInvalid, HoldExpired, HoldLimitReached, HoldNotFound, PaymentFailed, SeatUnavailable } from "./errors.js";

describe("booking errors", () => {
  it.each([
    [new SeatUnavailable(), "SEAT_UNAVAILABLE"],
    [new HoldExpired(), "HOLD_EXPIRED"],
    [new HoldLimitReached(), "HOLD_LIMIT_REACHED"],
    [new HoldNotFound(), "HOLD_NOT_FOUND"],
    [new PaymentFailed(), "PAYMENT_FAILED"],
    [new EventNotFound(), "EVENT_NOT_FOUND"],
    [new GuestEmailInvalid(), "GUEST_EMAIL_INVALID"],
  ])("%s carries a stable code", (error, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.publicCode).toBe(code);
    expect(error.name).toBe(error.constructor.name);
  });
});
