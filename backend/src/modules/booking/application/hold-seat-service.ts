import type { Clock } from "../../../shared/time/clock.js";
import { SeatUnavailable } from "../domain/errors.js";
import { assertSeatCapNotExceeded, holdExpiresAt } from "../domain/hold-rules.js";
import type { Holder } from "../domain/holder.js";
import type { HoldRepository } from "./ports/hold-repository.js";

export interface HoldSeatDeps {
  readonly holds: HoldRepository;
  readonly clock: Clock;
  readonly holdDurationMinutes: number;
  readonly maxSeatsPerHold: number;
}

export interface HoldSeatResult {
  readonly holdId: string;
  readonly expiresAt: Date;
  /** Every seat the hold holds after this call, in seat order. */
  readonly seatIds: readonly string[];
}

/** Hold on click (plan flow 1): one transaction, one clock read, one conditional seat UPDATE. */
export class HoldSeatService {
  constructor(private readonly deps: HoldSeatDeps) {}

  async hold(input: { holder: Holder; eventId: string; seatId: string }): Promise<HoldSeatResult> {
    const { holder, eventId, seatId } = input;
    const now = await this.deps.clock.now();
    const expiresAt = holdExpiresAt(now, this.deps.holdDurationMinutes);
    return this.deps.holds.inTransaction(async (tx) => {
      await tx.expireStaleHold(holder, eventId, now);
      const hold = await tx.getOrCreateActiveHold(holder, eventId, expiresAt, now);
      assertSeatCapNotExceeded(hold.seatCount, this.deps.maxSeatsPerHold);
      // A throw rolls back, so a hold created just now never stays behind empty.
      if (!(await tx.tryHoldSeat({ eventId, seatId, holdId: hold.id, expiresAt: hold.expiresAt, now }))) {
        throw new SeatUnavailable();
      }
      return { holdId: hold.id, expiresAt: hold.expiresAt, seatIds: await tx.seatIdsOfHold(hold.id) };
    });
  }
}
