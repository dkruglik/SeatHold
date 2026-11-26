import { isExpired } from "./hold-rules.js";

export type SeatStatus = "available" | "held" | "sold";
/** What every viewer sees. It never depends on who is looking. */
export type PublicSeatState = "available" | "held" | "sold";

export interface StoredSeat {
  readonly status: SeatStatus;
  readonly heldUntil: Date | null;
}

/** Lazy expiry: a stored `held` whose `heldUntil <= now` counts as available. */
export function publicSeatState(seat: StoredSeat, now: Date): PublicSeatState {
  if (seat.status === "held") {
    return seat.heldUntil === null || isExpired(seat.heldUntil, now) ? "available" : "held";
  }
  return seat.status;
}
