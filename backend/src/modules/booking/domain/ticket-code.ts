import { randomBytes } from "node:crypto";

/** A 128-bit random ticket code, base64url (22 characters). Unguessable and not derived from any id; it is the QR payload. */
export function generateTicketCode(): string {
  return randomBytes(16).toString("base64url");
}
