import type { Clock } from "../../../shared/time/clock.js";
import { HoldNotFound } from "../domain/errors.js";
import type { Holder } from "../domain/holder.js";
import type { CurrentHold, CurrentHoldReader } from "./ports/current-hold-reader.js";

/** The holder's live hold for an event (seat ids, expiresAt), or HoldNotFound. Read-only. */
export class GetCurrentHoldQuery {
  constructor(private readonly deps: { readonly holds: CurrentHoldReader; readonly clock: Clock }) {}

  async execute(input: { holder: Holder; eventId: string }): Promise<CurrentHold> {
    const now = await this.deps.clock.now();
    const hold = await this.deps.holds.findActive(input.holder, input.eventId, now);
    if (hold === undefined) throw new HoldNotFound();
    return hold;
  }
}
