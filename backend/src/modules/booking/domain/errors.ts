import { BusinessError, NotFoundError, PaymentRequiredError, ValidationError } from "../../../shared/errors/app-error.js";

/**
 * Booking rule violations. Each has a stable `publicCode` the HTTP error handler sends as `error.code`.
 * Intended HTTP status: SeatUnavailable, HoldExpired and HoldLimitReached 409; HoldNotFound and EventNotFound 404; PaymentFailed 402.
 */
export class SeatUnavailable extends BusinessError {
  constructor() {
    super("The seat is not available", { publicCode: "SEAT_UNAVAILABLE" });
  }
}

export class HoldExpired extends BusinessError {
  constructor() {
    super("The hold has expired", { publicCode: "HOLD_EXPIRED" });
  }
}

export class HoldLimitReached extends BusinessError {
  constructor() {
    super("The hold already has the maximum number of seats", { publicCode: "HOLD_LIMIT_REACHED" });
  }
}

export class HoldNotFound extends NotFoundError {
  constructor() {
    super("The hold was not found", { publicCode: "HOLD_NOT_FOUND" });
  }
}

export class PaymentFailed extends PaymentRequiredError {
  constructor() {
    super("The payment was not accepted", { publicCode: "PAYMENT_FAILED" });
  }
}

export class EventNotFound extends NotFoundError {
  constructor() {
    super("The event was not found", { publicCode: "EVENT_NOT_FOUND" });
  }
}

/** Intended HTTP status 400: a guest checkout needs a syntactically valid email. */
export class GuestEmailInvalid extends ValidationError {
  constructor() {
    super("A valid email address is required for a guest checkout", { publicCode: "GUEST_EMAIL_INVALID" });
  }
}
