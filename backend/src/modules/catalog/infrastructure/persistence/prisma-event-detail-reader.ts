import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { EventDetailReader, EventDetailRow } from "../../application/ports/event-detail-reader.js";
import { guarded } from "./persistence-errors.js";

interface Row {
  readonly event_id: string;
  readonly show_id: string;
  readonly title: string;
  readonly type: string;
  readonly genre: string;
  readonly description: string;
  readonly venue_id: string;
  readonly venue_name: string;
  readonly city: string;
  readonly country_code: string;
  readonly timezone: string;
  readonly starts_at: Date;
  readonly price_minor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seats_per_row: number;
  readonly seats_left: number;
}

/**
 * One statement: the event with its show and venue, and a scalar subquery counting free seats over `seats(event_id, status)`.
 * A seat is free when it is available or its hold ended at or before `now` (the lazy-expiry rule); `now` is bound, never SQL now().
 */
export class PrismaEventDetailReader implements EventDetailReader {
  constructor(private readonly prisma: PrismaService) {}

  find(eventId: string, now: Date): Promise<EventDetailRow | undefined> {
    return guarded("read event detail", async () => {
      const [r] = await this.prisma.client.$queryRaw<Row[]>`
        SELECT e.id AS event_id, e.show_id, sh.title, sh.type, sh.genre, sh.description, v.id AS venue_id, v.name AS venue_name,
               v.city, v.country_code, v.timezone, e.starts_at, e.price_minor, e.currency, e.rows, e.seats_per_row,
               (SELECT count(*)::int FROM seats s
                 WHERE s.event_id = e.id
                   AND (s.status = 'available' OR (s.status = 'held' AND s.held_until <= ${now}::timestamptz))) AS seats_left
        FROM events e JOIN shows sh ON sh.id = e.show_id JOIN venues v ON v.id = e.venue_id
        WHERE e.id = ${eventId}::uuid`;
      return r === undefined ? undefined : toDetail(r);
    });
  }
}

const toDetail = (r: Row): EventDetailRow => ({
  eventId: r.event_id, showId: r.show_id, title: r.title, type: r.type, genre: r.genre, description: r.description,
  venue: { id: r.venue_id, name: r.venue_name, city: r.city, countryCode: r.country_code, timezone: r.timezone },
  startsAt: r.starts_at, priceMinor: r.price_minor, currency: r.currency, rows: r.rows, seatsPerRow: r.seats_per_row, seatsLeft: r.seats_left,
});
