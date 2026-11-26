import { GoneError } from "../../../shared/errors/app-error.js";
import type { GuestLinkState } from "./guest-link-state.js";

/** A guest link that cannot be exchanged. Intended HTTP status 410 for all three; each has a stable `publicCode`. */
export class LinkUsed extends GoneError {
  constructor() {
    super("This link has already been used", { publicCode: "LINK_USED" });
  }
}

export class LinkExpired extends GoneError {
  constructor() {
    super("This link has expired", { publicCode: "LINK_EXPIRED" });
  }
}

export class LinkInvalid extends GoneError {
  constructor() {
    super("This link is not valid", { publicCode: "LINK_INVALID" });
  }
}

/** The error for a link that could not be consumed. Unknown and replaced (invalidated) links look the same to the caller. */
export function guestLinkErrorFor(state: Exclude<GuestLinkState, "usable">): LinkUsed | LinkExpired | LinkInvalid {
  if (state === "used") return new LinkUsed();
  if (state === "expired") return new LinkExpired();
  return new LinkInvalid();
}
