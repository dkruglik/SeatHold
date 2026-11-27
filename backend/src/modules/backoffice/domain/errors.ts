import { ValidationError } from "../../../shared/errors/app-error.js";

/** An event input outside the allowed bounds. The message names the field and the bound, never the value (HTTP 400, code INVALID_EVENT). */
export class InvalidEvent extends ValidationError {
  constructor(message: string) {
    super(message, { publicCode: "INVALID_EVENT" });
  }
}
