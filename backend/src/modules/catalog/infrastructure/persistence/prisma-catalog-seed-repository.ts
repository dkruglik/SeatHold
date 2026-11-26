import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { CatalogSeedRepository } from "../../application/ports/catalog-seed-repository.js";
import type { SeedEvent, SeedShow, SeedVenue } from "../../domain/catalog-seed-data.js";
import { toEventColumns, toShowColumns, toVenueColumns } from "./catalog-seed-mappers.js";
import { guarded } from "./persistence-errors.js";

/** Bulk, race-safe inserts: one statement per table, `ON CONFLICT DO NOTHING` on the natural key or stable id. */
export class PrismaCatalogSeedRepository implements CatalogSeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  insertVenues(venues: readonly SeedVenue[]): Promise<number> {
    return guarded("insert seed venues", () => {
      const c = toVenueColumns(venues);
      return this.prisma.client.$executeRaw`
        INSERT INTO venues (name, city, country_code, timezone)
        SELECT * FROM unnest(${c.names}::text[], ${c.cities}::text[], ${c.countryCodes}::char(2)[], ${c.timezones}::text[])
        ON CONFLICT (name, city) DO NOTHING`;
    });
  }

  insertShows(shows: readonly SeedShow[]): Promise<number> {
    return guarded("insert seed shows", () => {
      const c = toShowColumns(shows);
      return this.prisma.client.$executeRaw`
        INSERT INTO shows (id, title, type, genre, description)
        SELECT * FROM unnest(${c.ids}::uuid[], ${c.titles}::text[], ${c.types}::text[], ${c.genres}::text[], ${c.descriptions}::text[])
        ON CONFLICT (id) DO NOTHING`;
    });
  }

  insertEventsWithSeats(events: readonly SeedEvent[]): Promise<{ events: number; seats: number }> {
    return guarded("insert seed events and seats", () => {
      const c = toEventColumns(events);
      return this.prisma.client.$transaction(async (tx) => {
        const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO events (id, show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
          SELECT u.id, u.show_id, v.id, u.starts_at, u.price_minor, u.currency, u.rows, u.seats_per_row
          FROM unnest(${c.ids}::uuid[], ${c.showIds}::uuid[], ${c.venueNames}::text[], ${c.venueCities}::text[],
                      ${c.startsAt}::timestamptz[], ${c.prices}::int[], ${c.currencies}::char(3)[], ${c.rows}::int[], ${c.seatsPerRow}::int[])
            AS u(id, show_id, venue_name, venue_city, starts_at, price_minor, currency, rows, seats_per_row)
          JOIN venues v ON v.name = u.venue_name AND v.city = u.venue_city
          ON CONFLICT (id) DO NOTHING
          RETURNING id`;
        const ids = inserted.map((row) => row.id);
        const seats = await tx.$executeRaw`
          INSERT INTO seats (event_id, row_label, seat_number, status)
          SELECT e.id, chr(64 + r), n, 'available'
          FROM events e
          CROSS JOIN LATERAL generate_series(1, e.rows) AS r
          CROSS JOIN LATERAL generate_series(1, e.seats_per_row) AS n
          WHERE e.id = ANY(${ids}::uuid[])
          ON CONFLICT (event_id, row_label, seat_number) DO NOTHING`;
        return { events: ids.length, seats };
      });
    });
  }
}
