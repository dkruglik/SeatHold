export interface SeatReleaseInput {
  readonly eventId: string;
  readonly seatId: string;
  /** The signed-in operator, taken from the session, never from the request body. */
  readonly adminUserId: string;
  readonly reason: string;
  readonly now: Date;
}

/** `not_held`: the seat is in the event but available or sold. `not_found`: no such seat in the event. */
export type SeatReleaseOutcome = "released" | "not_held" | "not_found";

/** Frees a held seat and logs who did it, all or nothing. */
export interface SeatReleaser {
  release(input: SeatReleaseInput): Promise<SeatReleaseOutcome>;
}
