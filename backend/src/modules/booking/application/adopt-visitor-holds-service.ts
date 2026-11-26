import type { Clock } from "../../../shared/time/clock.js";
import type { HoldRepository } from "./ports/hold-repository.js";

export interface AdoptVisitorHoldsDeps {
  readonly holds: HoldRepository;
  readonly clock: Clock;
}

/**
 * Plan flow 9: a signed-in user takes over the active holds of the visitor token the browser still carries.
 * One transaction, one clock read. A stale hold of either side is expired first; when the user already has an active
 * hold for the event (also one created concurrently), the visitor's hold is released and its seats are freed.
 * Nothing to adopt is a no-op, so the caller can run it on every request that has both identities.
 */
export class AdoptVisitorHoldsService {
  constructor(private readonly deps: AdoptVisitorHoldsDeps) {}

  async adopt(input: { userId: string; visitorHash: string }): Promise<void> {
    const { userId, visitorHash } = input;
    const now = await this.deps.clock.now();
    await this.deps.holds.inTransaction(async (tx) => {
      for (const hold of await tx.listActiveVisitorHolds(visitorHash)) {
        await tx.expireStaleHold({ kind: "visitor", visitorHash }, hold.eventId, now);
        await tx.expireStaleHold({ kind: "user", userId }, hold.eventId, now);
        if (!(await tx.adoptHold({ holdId: hold.id, userId }))) {
          await tx.releaseHold(hold.id);
        }
      }
    });
  }
}
