import type { Holder } from "../../domain/holder.js";

export interface ActiveHold {
  readonly id: string;
  readonly expiresAt: Date;
  readonly seatCount: number;
}

/**
 * Statements of one database transaction. Every method takes the operation's `now`; none reads a clock itself.
 * Seat state changes only through the single conditional statements `tryHoldSeat` and `releaseSeat`.
 */
export interface HoldTransaction {
  /** Marks the holder's active hold for the event `expired` when `expiresAt <= now` and frees its seats. */
  expireStaleHold(holder: Holder, eventId: string, now: Date): Promise<void>;
  /** The holder's active hold for the event, locked until the transaction ends; undefined when there is none. */
  findActiveHold(holder: Holder, eventId: string): Promise<ActiveHold | undefined>;
  /** Finds the active hold or creates it with `expiresAt` (race-safe); a created hold has no seats. Locked like `findActiveHold`. */
  getOrCreateActiveHold(holder: Holder, eventId: string, expiresAt: Date, now: Date): Promise<ActiveHold>;
  /** One conditional UPDATE; false when the seat is not available at `now`. */
  tryHoldSeat(input: { eventId: string; seatId: string; holdId: string; expiresAt: Date; now: Date }): Promise<boolean>;
  /** One conditional UPDATE; false when the seat is not held by `holdId`. */
  releaseSeat(input: { eventId: string; seatId: string; holdId: string }): Promise<boolean>;
  /** Marks the hold `released` when it has no seats left. */
  releaseHoldIfEmpty(holdId: string): Promise<void>;
  /** The ids of the seats the hold holds, in seat order (row, number). */
  seatIdsOfHold(holdId: string): Promise<string[]>;
  /** The active holds of one visitor over all events, locked until the transaction ends. */
  listActiveVisitorHolds(visitorHash: string): Promise<{ id: string; eventId: string }[]>;
  /**
   * Moves an active visitor hold to the user (`user_id` set, `visitor_hash` cleared). False, with nothing changed,
   * when the hold is no longer active or the user already has an active hold for that event, also when that hold is created concurrently.
   */
  adoptHold(input: { holdId: string; userId: string }): Promise<boolean>;
  /** Frees every seat of the hold and marks it `released`. */
  releaseHold(holdId: string): Promise<void>;
}

export interface HoldRepository {
  /** Runs `work` in one transaction; any error thrown by `work` rolls everything back and propagates. */
  inTransaction<T>(work: (tx: HoldTransaction) => Promise<T>): Promise<T>;
}
