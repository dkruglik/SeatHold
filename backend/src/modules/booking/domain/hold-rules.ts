import { HoldLimitReached } from "./errors.js";

const MS_PER_MINUTE = 60_000;

export function holdExpiresAt(now: Date, holdDurationMinutes: number): Date {
  return new Date(now.getTime() + holdDurationMinutes * MS_PER_MINUTE);
}

/** The one expiry rule: a hold is over at exactly `expiresAt`. */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Adding one more seat to a hold that has `currentSeatCount` seats must not pass the cap. */
export function assertSeatCapNotExceeded(currentSeatCount: number, maxSeatsPerHold: number): void {
  if (currentSeatCount + 1 > maxSeatsPerHold) {
    throw new HoldLimitReached();
  }
}
