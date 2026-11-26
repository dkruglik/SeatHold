import type { Holder } from "../../domain/holder.js";

export interface CurrentHold {
  readonly holdId: string;
  readonly expiresAt: Date;
  readonly seatIds: readonly string[];
}

/** Read-only port. Returns the holder's active hold only while `expires_at > now`. */
export interface CurrentHoldReader {
  findActive(holder: Holder, eventId: string, now: Date): Promise<CurrentHold | undefined>;
}
