import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";

export const T0 = new Date("2026-01-01T12:00:00Z");
export const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);

/** 20 concurrent callers each need a connection (the limiter holds one while it waits for its lock). */
const POOL = 30;

/** Connects a pool and truncates the guest-access tables and the booking rows they reference before each test. */
export function useGuestAccessDatabase(): PrismaService {
  const prisma = new PrismaService(process.env.DATABASE_URL ?? "", POOL);
  beforeAll(() => prisma.connect());
  afterAll(() => prisma.disconnect());
  beforeEach(async () => {
    await prisma.client.$executeRawUnsafe(
      "TRUNCATE TABLE guest_access_links, guest_sessions, guest_resend_attempts, payments, tickets, bookings, seats, holds, events, shows, venues CASCADE",
    );
  });
  return prisma;
}

/** A confirmed guest booking written by SQL (the booking module owns that write path). Returns the booking id. */
export async function insertGuestBooking(prisma: PrismaService): Promise<string> {
  const [venue] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO venues (name, city, country_code, timezone) VALUES (${`Hall ${randomUUID()}`}, 'Berlin', 'DE', 'Europe/Berlin') RETURNING id`;
  const [show] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO shows (title, type, genre, description) VALUES ('Show', 'concert', 'rock', 'd') RETURNING id`;
  const [event] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO events (show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
    VALUES (${show?.id}::uuid, ${venue?.id}::uuid, ${new Date("2026-02-01T12:00:00Z")}, 5000, 'EUR', 1, 1) RETURNING id`;
  const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO holds (event_id, visitor_hash, expires_at, status, created_at)
    VALUES (${event?.id}::uuid, 'v', ${T0}, 'converted', ${T0}) RETURNING id`;
  const [booking] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO bookings (hold_id, event_id, guest_email, status, unit_price_minor, total_minor, currency, created_at)
    VALUES (${hold?.id}::uuid, ${event?.id}::uuid, 'g@example.com', 'confirmed', 5000, 5000, 'EUR', ${T0}) RETURNING id`;
  return booking?.id ?? "";
}
