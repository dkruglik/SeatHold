import { BusinessError, NotFoundError, ValidationError } from "../../../shared/errors/app-error.js";

/** An event input outside the allowed bounds. The message names the field and the bound, never the value (HTTP 400, code INVALID_EVENT). */
export class InvalidEvent extends ValidationError {
  constructor(message: string) {
    super(message, { publicCode: "INVALID_EVENT" });
  }
}

/** A release reason outside 3..500 characters after trimming (HTTP 400, code INVALID_RELEASE_REASON). The message never carries the text. */
export class InvalidSeatRelease extends ValidationError {
  constructor(message: string) {
    super(message, { publicCode: "INVALID_RELEASE_REASON" });
  }
}

/** The seat exists in the event but is available or sold, so there is nothing to release (HTTP 409, code SEAT_NOT_HELD). */
export class SeatNotHeld extends BusinessError {
  constructor() {
    super("The seat is not held", { publicCode: "SEAT_NOT_HELD" });
  }
}

/** No such seat in this event (HTTP 404, code SEAT_NOT_FOUND). */
export class SeatNotFound extends NotFoundError {
  constructor() {
    super("The seat was not found", { publicCode: "SEAT_NOT_FOUND" });
  }
}
