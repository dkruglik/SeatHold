import { Prisma } from "../../../../generated/prisma/client.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { EventSearchCriteria, EventSearchPage, EventSearchReader } from "../../application/ports/event-search-reader.js";
import { buildEventFilters } from "./event-search-sql.js";
import { guarded } from "./persistence-errors.js";

interface Row {
  readonly event_id: string;
  readonly show_id: string;
  readonly title: string;
  readonly type: string;
  readonly genre: string;
  readonly venue_id: string;
  readonly venue_name: string;
  readonly city: string;
  readonly country_code: string;
  readonly timezone: string;
  readonly starts_at: Date;
  readonly price_minor: number;
  readonly currency: string;
  readonly seats_left: number;
}

const FROM = Prisma.sql`FROM events e JOIN shows sh ON sh.id = e.show_id JOIN venues v ON v.id = e.venue_id`;

/**
 * Two statements per request: the match count, and the page with its seat counts. The page is cut first (ordered by
 * start, then id), and seats are counted by one grouped query over `seats(event_id, status)` for the events on it.
 * A seat is free when it is available or its hold ended at or before `now` (the lazy-expiry rule); `now` is bound, never SQL now().
 */
export class PrismaEventSearchReader implements EventSearchReader {
  constructor(private readonly prisma: PrismaService) {}

  search(criteria: EventSearchCriteria): Promise<EventSearchPage> {
    return guarded("search events", async () => {
      const where = buildEventFilters(criteria);
      const [counted, rows] = await Promise.all([
        this.prisma.client.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total ${FROM} WHERE ${where}`),
        this.prisma.client.$queryRaw<Row[]>(pageQuery(where, criteria)),
      ]);
      return { total: counted[0]?.total ?? 0, rows: rows.map(toRow) };
    });
  }
}

function pageQuery(where: Prisma.Sql, c: EventSearchCriteria): Prisma.Sql {
  return Prisma.sql`
    WITH page AS (
      SELECT e.id AS event_id, e.show_id, sh.title, sh.type, sh.genre, v.id AS venue_id, v.name AS venue_name, v.city,
             v.country_code, v.timezone, e.starts_at, e.price_minor, e.currency
      ${FROM} WHERE ${where}
      ORDER BY e.starts_at, e.id LIMIT ${c.limit} OFFSET ${c.offset}
    ), free AS (
      SELECT s.event_id, count(*)::int AS n
      FROM seats s
      WHERE s.event_id IN (SELECT event_id FROM page)
        AND (s.status = 'available' OR (s.status = 'held' AND s.held_until <= ${c.now}::timestamptz))
      GROUP BY s.event_id
    )
    SELECT page.*, COALESCE(free.n, 0) AS seats_left
    FROM page LEFT JOIN free ON free.event_id = page.event_id
    ORDER BY page.starts_at, page.event_id`;
}

const toRow = (r: Row): EventSearchPage["rows"][number] => ({
  eventId: r.event_id, showId: r.show_id, title: r.title, type: r.type, genre: r.genre,
  venue: { id: r.venue_id, name: r.venue_name, city: r.city, countryCode: r.country_code, timezone: r.timezone },
  startsAt: r.starts_at, priceMinor: r.price_minor, currency: r.currency, seatsLeft: r.seats_left,
});
