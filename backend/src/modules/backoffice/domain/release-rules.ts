import { InvalidSeatRelease } from "./errors.js";

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** The operator's reason, trimmed, 3..500 characters. The message names the bound, never the text. */
export function parseReleaseReason(raw: unknown): string {
  if (typeof raw !== "string") throw new InvalidSeatRelease("reason must be a string");
  const reason = raw.trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new InvalidSeatRelease(`reason must be between ${REASON_MIN} and ${REASON_MAX} characters`);
  }
  return reason;
}
