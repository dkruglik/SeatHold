import type { Clock } from "../../../shared/time/clock.js";
import { SeatNotFound, SeatNotHeld } from "../domain/errors.js";
import { parseReleaseReason } from "../domain/release-rules.js";
import type { SeatReleaser } from "./ports/seat-releaser.js";

export interface ReleaseHeldSeatDeps {
  readonly releaser: SeatReleaser;
  readonly clock: Clock;
}

/** An operator frees a seat stuck in a buyer's hold. The reason is validated first; the releaser does the write and the log in one transaction. */
export class ReleaseHeldSeatService {
  constructor(private readonly deps: ReleaseHeldSeatDeps) {}

  async execute(input: { eventId: string; seatId: string; adminUserId: string; reason: unknown }): Promise<{ seatId: string; eventId: string }> {
    const reason = parseReleaseReason(input.reason);
    const now = await this.deps.clock.now();
    const outcome = await this.deps.releaser.release({ eventId: input.eventId, seatId: input.seatId, adminUserId: input.adminUserId, reason, now });
    if (outcome === "not_found") throw new SeatNotFound();
    if (outcome === "not_held") throw new SeatNotHeld();
    return { seatId: input.seatId, eventId: input.eventId };
  }
}
