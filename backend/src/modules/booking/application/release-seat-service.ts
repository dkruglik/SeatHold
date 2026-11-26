import type { Clock } from "../../../shared/time/clock.js";
import { HoldNotFound } from "../domain/errors.js";
import type { Holder } from "../domain/holder.js";
import type { HoldRepository } from "./ports/hold-repository.js";

export interface ReleaseSeatDeps {
  readonly holds: HoldRepository;
  readonly clock: Clock;
}

/** Release a seat of the holder's own hold (plan flow 2). Another holder's seat looks like a missing hold. */
export class ReleaseSeatService {
  constructor(private readonly deps: ReleaseSeatDeps) {}

  async release(input: { holder: Holder; eventId: string; seatId: string }): Promise<void> {
    const { holder, eventId, seatId } = input;
    // Read once for the operation's contract; the release statement itself needs no time.
    await this.deps.clock.now();
    await this.deps.holds.inTransaction(async (tx) => {
      const hold = await tx.findActiveHold(holder, eventId);
      if (hold === undefined || !(await tx.releaseSeat({ eventId, seatId, holdId: hold.id }))) {
        throw new HoldNotFound();
      }
      await tx.releaseHoldIfEmpty(hold.id);
    });
  }
}
