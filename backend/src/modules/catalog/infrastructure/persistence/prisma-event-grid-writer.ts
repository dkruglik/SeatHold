import type { Prisma } from "../../../../generated/prisma/client.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { NotFoundError } from "../../../../shared/errors/app-error.js";
import type { CreatedEvent, EventGridWriter, NewEventGrid, ShowRef, VenueRef } from "../../application/ports/event-grid-writer.js";
import { VenueConflict } from "../../domain/errors.js";
import { rowLabels } from "../../domain/row-label.js";
import { guarded } from "../../../../shared/persistence/guarded.js";

type Tx = Prisma.TransactionClient;

// 20,000 seats come from one INSERT ... SELECT, but the transaction still gets a generous bound.
const TRANSACTION_TIMEOUT_MS = 30_000;

class ShowNotFound extends NotFoundError {
  constructor() {
    super("The show was not found", { publicCode: "SHOW_NOT_FOUND" });
  }
}

class VenueNotFound extends NotFoundError {
  constructor() {
    super("The venue was not found", { publicCode: "VENUE_NOT_FOUND" });
  }
}

async function resolveShow(tx: Tx, ref: ShowRef): Promise<{ id: string; title: string }> {
  if ("existingId" in ref) {
    const [show] = await tx.$queryRaw<{ id: string; title: string }[]>`SELECT id, title FROM shows WHERE id = ${ref.existingId}::uuid`;
    if (show === undefined) throw new ShowNotFound();
    return show;
  }
  const { title, type, genre, description } = ref.new;
  const [show] = await tx.$queryRaw<{ id: string; title: string }[]>`
    INSERT INTO shows (title, type, genre, description) VALUES (${title}, ${type}, ${genre}, ${description}) RETURNING id, title`;
  return show as { id: string; title: string };
}

/**
 * A new venue reuses the row with the same (name, city) when its country and timezone match; the no-op update makes RETURNING
 * answer for it too, so there is no unique violation to catch. A different country or timezone throws VenueConflict, which rolls the transaction back.
 */
async function resolveVenueId(tx: Tx, ref: VenueRef): Promise<string> {
  if ("existingId" in ref) {
    const [venue] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM venues WHERE id = ${ref.existingId}::uuid`;
    if (venue === undefined) throw new VenueNotFound();
    return venue.id;
  }
  const { name, city, countryCode, timezone } = ref.new;
  const [venue] = await tx.$queryRaw<{ id: string; country_code: string; timezone: string }[]>`
    INSERT INTO venues (name, city, country_code, timezone) VALUES (${name}, ${city}, ${countryCode}, ${timezone})
    ON CONFLICT (name, city) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, country_code, timezone`;
  const stored = venue as { id: string; country_code: string; timezone: string };
  const differing = [...(stored.country_code === countryCode ? [] : ["country"]), ...(stored.timezone === timezone ? [] : ["timezone"])];
  if (differing.length > 0) throw new VenueConflict(differing);
  return stored.id;
}

/** Writes show, venue, event and the whole seat grid in one transaction. */
export class PrismaEventGridWriter implements EventGridWriter {
  constructor(private readonly prisma: PrismaService) {}

  create(grid: NewEventGrid): Promise<CreatedEvent> {
    return guarded("create event with grid", () =>
      this.prisma.client.$transaction((tx) => this.write(tx, grid), { timeout: TRANSACTION_TIMEOUT_MS }),
    );
  }

  private async write(tx: Tx, grid: NewEventGrid): Promise<CreatedEvent> {
    const show = await resolveShow(tx, grid.show);
    const venueId = await resolveVenueId(tx, grid.venue);
    const [event] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO events (show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
      VALUES (${show.id}::uuid, ${venueId}::uuid, ${grid.startsAt}, ${grid.priceMinor}, ${grid.currency}, ${grid.rows}, ${grid.seatsPerRow})
      RETURNING id`;
    const eventId = (event as { id: string }).id;
    const seatCount = await tx.$executeRaw`
      INSERT INTO seats (event_id, row_label, seat_number, status)
      SELECT ${eventId}::uuid, l.label, n, 'available'
      FROM unnest(${rowLabels(grid.rows)}::text[]) AS l(label)
      CROSS JOIN generate_series(1, ${grid.seatsPerRow}::int) AS n`;
    return { eventId, showId: show.id, venueId, title: show.title, startsAt: grid.startsAt, priceMinor: grid.priceMinor, currency: grid.currency, rows: grid.rows, seatsPerRow: grid.seatsPerRow, seatCount };
  }
}
