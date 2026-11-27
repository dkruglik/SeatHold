import { NotFoundError } from "../../../shared/errors/app-error.js";

/** The event does not exist. Same kind and public code as the booking module's, so both routes answer alike (HTTP 404). */
export class EventNotFound extends NotFoundError {
  constructor() {
    super("The event was not found", { publicCode: "EVENT_NOT_FOUND" });
  }
}
