import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";

/** Deterministic ids: the n-th id of a kind, so ties on the start time are broken in a known order. */
export const uuid = (kind: number, n: number): string => `${String(kind).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const NOW = new Date("2030-06-01T12:00:00.000Z");

export const VENUES = {
  olympia: { id: uuid(1, 1), name: "Olympia Hall", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
  arena: { id: uuid(1, 2), name: "Royal Arena", city: "London", countryCode: "GB", timezone: "Europe/London" },
  wild: { id: uuid(1, 3), name: "Base_ment 100%", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
  club: { id: uuid(1, 4), name: "Basement Club", city: "Paris", countryCode: "FR", timezone: "Europe/Paris" },
} as const;

export const SHOWS = {
  rock: { id: uuid(2, 1), title: "Rock Night", type: "concert", genre: "rock" },
  jazz: { id: uuid(2, 2), title: "Jazz Evening", type: "concert", genre: "jazz" },
  hamlet: { id: uuid(2, 3), title: "Hamlet", type: "theatre", genre: "drama" },
  swan: { id: uuid(2, 4), title: "Swan Lake", type: "theatre", genre: "ballet" },
} as const;

export interface Venue { id: string; name: string; city: string; countryCode: string; timezone: string }
export interface Show { id: string; title: string; type: string; genre: string }

export async function insertVenue(prisma: PrismaService, v: Venue): Promise<void> {
  await prisma.client.$executeRaw`INSERT INTO venues (id, name, city, country_code, timezone) VALUES (${v.id}::uuid, ${v.name}, ${v.city}, ${v.countryCode}, ${v.timezone})`;
}

export async function insertShow(prisma: PrismaService, s: Show): Promise<void> {
  await prisma.client.$executeRaw`INSERT INTO shows (id, title, type, genre, description) VALUES (${s.id}::uuid, ${s.title}, ${s.type}, ${s.genre}, 'd')`;
}

/** An event with `seats` available seats in row A. Returns the seat ids. */
export async function insertEvent(
  prisma: PrismaService,
  e: { id: string; show: Show; venue: Venue; startsAt: Date; priceMinor?: number; seats?: number },
): Promise<string[]> {
  const seats = e.seats ?? 1;
  await prisma.client.$executeRaw`
    INSERT INTO events (id, show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
    VALUES (${e.id}::uuid, ${e.show.id}::uuid, ${e.venue.id}::uuid, ${e.startsAt}, ${e.priceMinor ?? 5000}, 'EUR', 1, ${seats})`;
  const rows = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO seats (event_id, row_label, seat_number, status)
    SELECT ${e.id}::uuid, 'A', n, 'available' FROM generate_series(1, ${seats}::int) AS n ORDER BY n RETURNING id`;
  return rows.map((r) => r.id);
}

const at = (iso: string): Date => new Date(iso);

export const EVENTS = {
  past: uuid(3, 1),
  rockBerlin: uuid(3, 2),
  rockLondon: uuid(3, 3),
  jazzBerlin: uuid(3, 4),
  hamletLondon: uuid(3, 5),
  hamletWild: uuid(3, 6),
  swanParis: uuid(3, 7),
} as const;

/** Six upcoming events and one past one; rockLondon and jazzBerlin start at the same instant. */
export async function insertCatalogFixture(prisma: PrismaService): Promise<void> {
  for (const v of Object.values(VENUES)) await insertVenue(prisma, v);
  for (const s of Object.values(SHOWS)) await insertShow(prisma, s);
  await insertEvent(prisma, { id: EVENTS.past, show: SHOWS.rock, venue: VENUES.olympia, startsAt: at("2030-05-01T18:00:00.000Z") });
  await insertEvent(prisma, { id: EVENTS.rockBerlin, show: SHOWS.rock, venue: VENUES.olympia, startsAt: at("2030-07-01T18:00:00.000Z"), priceMinor: 4500, seats: 4 });
  await insertEvent(prisma, { id: EVENTS.rockLondon, show: SHOWS.rock, venue: VENUES.arena, startsAt: at("2030-07-02T18:00:00.000Z"), seats: 2 });
  await insertEvent(prisma, { id: EVENTS.jazzBerlin, show: SHOWS.jazz, venue: VENUES.olympia, startsAt: at("2030-07-02T18:00:00.000Z"), seats: 2 });
  await insertEvent(prisma, { id: EVENTS.hamletLondon, show: SHOWS.hamlet, venue: VENUES.arena, startsAt: at("2030-08-01T18:00:00.000Z") });
  await insertEvent(prisma, { id: EVENTS.hamletWild, show: SHOWS.hamlet, venue: VENUES.wild, startsAt: at("2030-09-01T18:00:00.000Z") });
  await insertEvent(prisma, { id: EVENTS.swanParis, show: SHOWS.swan, venue: VENUES.club, startsAt: at("2030-09-02T18:00:00.000Z") });
}
