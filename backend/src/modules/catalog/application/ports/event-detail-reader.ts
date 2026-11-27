import type { EventSearchRow } from "./event-search-reader.js";

export interface EventDetailRow extends EventSearchRow {
  readonly description: string;
  readonly rows: number;
  readonly seatsPerRow: number;
}

export interface EventDetailReader {
  /** The event with its show, venue and seats left; undefined when there is no such event. Seats whose hold ended at or before `now` count as free. */
  find(eventId: string, now: Date): Promise<EventDetailRow | undefined>;
}
