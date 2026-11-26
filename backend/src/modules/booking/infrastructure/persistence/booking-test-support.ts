import { afterAll, beforeAll, beforeEach } from "vitest";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";

import { createBookingServices, type BookingServices } from "../../booking-composition.js";
import type { PaymentGateway } from "../../application/ports/payment-gateway.js";
import { holderFrom, type Holder } from "../../domain/holder.js";

export const T0 = new Date("2026-01-01T12:00:00Z");

/** Large enough that 100 parallel transactions each get their own connection (PostgreSQL allows 100 by default; the test DB is set up for it). */
const POOL = 100;

/** Connects a pool of `POOL` connections and truncates every Phase 2 table before each test. */
export function useBookingPool(): PrismaService {
  const prisma = new PrismaService(process.env.DATABASE_URL ?? "", POOL);
  beforeAll(() => prisma.connect());
  afterAll(() => prisma.disconnect());
  beforeEach(async () => {
    await prisma.client.$executeRawUnsafe(
      "TRUNCATE TABLE payments, tickets, bookings, seats, holds, events, shows, venues, sessions, users CASCADE",
    );
  });
  return prisma;
}

export interface SeatedEvent {
  readonly eventId: string;
  readonly seatIds: readonly string[];
}

/** One event with `seatCount` available seats in row A. */
export async function insertSeatedEvent(prisma: PrismaService, seatCount: number): Promise<SeatedEvent> {
  const [venue] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO venues (name, city, country_code, timezone) VALUES ('Hall', 'Berlin', 'DE', 'Europe/Berlin') RETURNING id`;
  const [show] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO shows (title, type, genre, description) VALUES ('Show', 'concert', 'rock', 'd') RETURNING id`;
  const [event] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO events (show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
    VALUES (${show?.id}::uuid, ${venue?.id}::uuid, ${new Date("2026-02-01T12:00:00Z")}, 5000, 'EUR', 1, ${seatCount}) RETURNING id`;
  const seats = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO seats (event_id, row_label, seat_number, status)
    SELECT ${event?.id}::uuid, 'A', n, 'available' FROM generate_series(1, ${seatCount}::int) AS n ORDER BY n RETURNING id`;
  return { eventId: event?.id ?? "", seatIds: seats.map((s) => s.id) };
}

export async function insertUser(prisma: PrismaService, email: string): Promise<string> {
  const [user] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO users (email, created_at) VALUES (${email}, ${T0}) RETURNING id`;
  return user?.id ?? "";
}

export async function markSold(prisma: PrismaService, seatId: string): Promise<void> {
  await prisma.client.$executeRaw`UPDATE seats SET status = 'sold', hold_id = NULL, held_until = NULL WHERE id = ${seatId}::uuid`;
}

export interface SeatRow {
  readonly status: string;
  readonly hold_id: string | null;
  readonly held_until: Date | null;
}

export async function seatRow(prisma: PrismaService, seatId: string): Promise<SeatRow> {
  const rows = await prisma.client.$queryRaw<SeatRow[]>`SELECT status, hold_id, held_until FROM seats WHERE id = ${seatId}::uuid`;
  return rows[0] as SeatRow;
}

export interface HoldRow {
  readonly id: string;
  readonly status: string;
  readonly expires_at: Date;
}

export function holdRows(prisma: PrismaService, eventId: string): Promise<HoldRow[]> {
  return prisma.client.$queryRaw<HoldRow[]>`SELECT id, status, expires_at FROM holds WHERE event_id = ${eventId}::uuid ORDER BY created_at, id`;
}

export const visitor = (n: number | string): Holder => holderFrom({ visitorHash: `visitor-${n}` });

/** Services over the real database with a controlled clock reset to T0. */
export function bookingTestServices(
  prisma: PrismaService,
  maxSeatsPerHold = 10,
  clock = new ControlledClock(T0),
  paymentGateway?: PaymentGateway,
): BookingServices {
  clock.set(T0);
  return createBookingServices({ prisma, clock, holdDurationMinutes: 10, maxSeatsPerHold, ...(paymentGateway ? { paymentGateway } : {}) });
}
