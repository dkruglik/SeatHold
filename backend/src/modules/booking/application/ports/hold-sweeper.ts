/** Bounded bulk statements of the sweeper. `now` is a bound parameter; no statement reads a clock. */
export interface HoldSweeper {
  /** Frees at most `limit` held seats with `held_until <= now` and returns how many it freed. Skips rows other sessions lock. */
  freeExpiredSeats(now: Date, limit: number): Promise<number>;
  /** Marks at most `limit` active holds with `expires_at <= now` and no seats as `expired`; returns how many. */
  expireEmptyHolds(now: Date, limit: number): Promise<number>;
}
