import { GuestEmailInvalid } from "./errors.js";

const MAX_LENGTH = 254;
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** A trimmed, syntactically valid email, or GuestEmailInvalid. Deliverability is not checked. */
export function parseGuestEmail(raw: string | undefined): string {
  const email = raw?.trim() ?? "";
  if (email.length === 0 || email.length > MAX_LENGTH || !SHAPE.test(email)) {
    throw new GuestEmailInvalid();
  }
  return email;
}
