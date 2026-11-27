import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { AdminEventListReader, AdminEventRow, PageCriteria, Rows } from "../../application/ports/admin-readers.js";
import { guarded } from "./persistence-errors.js";

interface Row {
  readonly event_id: string;
  readonly title: string;
  readonly venue_name: string;
  readonly city: string;
  readonly timezone: string;
  readonly starts_at: Date;
  readonly price_minor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seats_per_row: number;
  readonly sold: number;
  readonly held: number;
  readonly available: number;
}

/**
 * Back-office read model over the shared catalog and booking tables (read-only SQL; no other module's code is imported).
 * Two statements per request: the event count, and the page (newest start first, then id) with its seat counts from ONE
 * grouped query over `seats(event_id, status)` for the events on the page. A hold counts as held only while
 * `held_until > now`; an ended hold counts as available (the lazy-expiry rule of the seat map and the search). `now` is bound.
 */
export class PrismaAdminEventListReader implements AdminEventListReader {
  constructor(private readonly prisma: PrismaService) {}

  list(criteria: PageCriteria & { readonly now: Date }): Promise<Rows<AdminEventRow>> {
    return guarded("list admin events", async () => {
      const [counted, rows] = await Promise.all([
        this.prisma.client.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM events`,
        this.prisma.client.$queryRaw<Row[]>`
          WITH page AS (
            SELECT e.id, sh.title, v.name AS venue_name, v.city, v.timezone, e.starts_at, e.price_minor, e.currency, e.rows, e.seats_per_row
            FROM events e JOIN shows sh ON sh.id = e.show_id JOIN venues v ON v.id = e.venue_id
            ORDER BY e.starts_at DESC, e.id LIMIT ${criteria.limit} OFFSET ${criteria.offset}
          ), counts AS (
            SELECT s.event_id,
                   count(*) FILTER (WHERE s.status = 'sold')::int AS sold,
                   count(*) FILTER (WHERE s.status = 'held' AND s.held_until > ${criteria.now}::timestamptz)::int AS held,
                   count(*) FILTER (WHERE s.status = 'available' OR (s.status = 'held' AND s.held_until <= ${criteria.now}::timestamptz))::int AS available
            FROM seats s WHERE s.event_id IN (SELECT id FROM page) GROUP BY s.event_id
          )
          SELECT page.id AS event_id, page.title, page.venue_name, page.city, page.timezone, page.starts_at, page.price_minor, page.currency,
                 page.rows, page.seats_per_row, COALESCE(c.sold, 0) AS sold, COALESCE(c.held, 0) AS held, COALESCE(c.available, 0) AS available
          FROM page LEFT JOIN counts c ON c.event_id = page.id
          ORDER BY page.starts_at DESC, page.id`,
      ]);
      return { total: counted[0]?.total ?? 0, rows: rows.map(toRow) };
    });
  }
}

const toRow = (r: Row): AdminEventRow => ({
  eventId: r.event_id, showTitle: r.title, venueName: r.venue_name, city: r.city, timezone: r.timezone, startsAt: r.starts_at,
  priceMinor: r.price_minor, currency: r.currency, rows: r.rows, seatsPerRow: r.seats_per_row,
  sold: r.sold, held: r.held, available: r.available,
});
