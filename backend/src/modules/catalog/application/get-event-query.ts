import type { Clock } from "../../../shared/time/clock.js";
import { EventNotFound } from "../domain/errors.js";
import type { EventDetailReader, EventDetailRow } from "./ports/event-detail-reader.js";

/** Public event detail: the same for every viewer. The clock is read once and handed to the reader for the lazy-expiry seat count. */
export class GetEventQuery {
  constructor(private readonly deps: { readonly reader: EventDetailReader; readonly clock: Clock }) {}

  async execute(eventId: string): Promise<EventDetailRow> {
    const now = await this.deps.clock.now();
    const event = await this.deps.reader.find(eventId, now);
    if (event === undefined) throw new EventNotFound();
    return event;
  }
}
