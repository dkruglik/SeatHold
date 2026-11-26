import pg from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";

/** Runs a raw statement on its own pg connection and returns the Postgres error code, or null when it succeeded. */
export async function sqlErrorCode(sql: string, params: unknown[] = []): Promise<string | null> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "" });
  await client.connect();
  try {
    await client.query(sql, params);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  } finally {
    await client.end();
  }
}

export const NOW = new Date("2026-01-01T12:00:00Z");
export const LATER = new Date("2026-01-01T12:10:00Z");
export const UNIQUE_VIOLATION = "23505";
export const CHECK_VIOLATION = "23514";

export interface EventFixture {
  eventId: string;
  seatId: string;
  userId: string;
}

/** Connects, and truncates every Phase 2 table (and users) before each test of the surrounding describe. */
export function useBookingDatabase(): PrismaService {
  const prisma = new PrismaService(process.env.DATABASE_URL ?? "", 6);
  beforeAll(() => prisma.connect());
  afterAll(() => prisma.disconnect());
  beforeEach(async () => {
    await prisma.client.$executeRawUnsafe(
      "TRUNCATE TABLE payments, tickets, bookings, seats, holds, events, shows, venues, sessions, users CASCADE",
    );
  });
  return prisma;
}

/** Inserts a venue, show, event (10 x 20), one available seat and one user through raw SQL. */
export async function insertEventFixture(
  prisma: PrismaService,
): Promise<EventFixture> {
  const [venue] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO venues (name, city, country_code, timezone) VALUES ('Hall', 'Berlin', 'DE', 'Europe/Berlin') RETURNING id`;
  const [show] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO shows (title, type, genre, description) VALUES ('Show', 'concert', 'rock', 'd') RETURNING id`;
  const [event] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO events (show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
    VALUES (${show?.id}::uuid, ${venue?.id}::uuid, ${LATER}, 5000, 'EUR', 10, 20) RETURNING id`;
  const [seat] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO seats (event_id, row_label, seat_number, status) VALUES (${event?.id}::uuid, 'A', 1, 'available') RETURNING id`;
  const [user] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO users (email, created_at) VALUES ('u@x.io', ${NOW}) RETURNING id`;
  return {
    eventId: event?.id ?? "",
    seatId: seat?.id ?? "",
    userId: user?.id ?? "",
  };
}

/** Adds an active visitor hold to a fresh event fixture. */
export async function insertHoldFixture(
  prisma: PrismaService,
): Promise<EventFixture & { holdId: string }> {
  const fixture = await insertEventFixture(prisma);
  const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO holds (event_id, visitor_hash, expires_at, status, created_at)
    VALUES (${fixture.eventId}::uuid, 'v1', ${LATER}, 'active', ${NOW}) RETURNING id`;
  return { ...fixture, holdId: hold?.id ?? "" };
}
