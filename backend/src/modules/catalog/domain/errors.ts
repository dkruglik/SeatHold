import { BusinessError, NotFoundError } from "../../../shared/errors/app-error.js";

/** The event does not exist. Same kind and public code as the booking module's, so both routes answer alike (HTTP 404). */
export class EventNotFound extends NotFoundError {
  constructor() {
    super("The event was not found", { publicCode: "EVENT_NOT_FOUND" });
  }
}

/** A "new" venue has the name and city of an existing one but another country or timezone (HTTP 409, code VENUE_CONFLICT). The message names the differing fields, never the values. */
export class VenueConflict extends BusinessError {
  constructor(differing: readonly string[]) {
    super(`A venue with this name and city already exists with a different ${differing.join(" and ")}; select the existing venue instead`, { publicCode: "VENUE_CONFLICT" });
  }
}
