import { randomUUID } from "node:crypto";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";

/** Raw-SQL fixtures for the back-office read tests: events with exactly the seats a test names, in any state. */
export interface SeededEvent {
  readonly eventId: string;
  /** Seat id by key `${row}${number}`, for example "A1" or "AA2". */
  readonly seat: Readonly<Record<string, string>>;
}

export interface SeedEventOptions {
  readonly title?: string;
  readonly startsAt?: Date;
  /** [row label, seat number] pairs; the event grid columns stay a plain 2 x 2 because only the seats matter to the readers. */
  readonly seats: readonly (readonly [string, number])[];
}

export async function seedEvent(prisma: PrismaService, options: SeedEventOptions): Promise<SeededEvent> {
  const db = prisma.client;
  const [venue] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO venues (name, city, country_code, timezone) VALUES (${`Hall ${randomUUID()}`}, 'Berlin', 'DE', 'Europe/Berlin') RETURNING id`;
  const [show] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO shows (title, type, genre, description) VALUES (${options.title ?? "Show"}, 'concert', 'rock', 'd') RETURNING id`;
  const [event] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO events (show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
    VALUES (${show?.id}::uuid, ${venue?.id}::uuid, ${options.startsAt ?? new Date("2030-06-01T18:00:00Z")}, 5000, 'EUR', 2, 2) RETURNING id`;
  const seat: Record<string, string> = {};
  for (const [row, number] of options.seats) {
    const [inserted] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO seats (event_id, row_label, seat_number, status) VALUES (${event?.id}::uuid, ${row}, ${number}, 'available') RETURNING id`;
    seat[`${row}${number}`] = inserted?.id ?? "";
  }
  return { eventId: event?.id ?? "", seat };
}

/** Puts the seat under a new active hold that ends at `until`. */
export async function holdSeat(prisma: PrismaService, eventId: string, seatId: string, until: Date): Promise<void> {
  const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO holds (event_id, visitor_hash, expires_at, status, created_at)
    VALUES (${eventId}::uuid, ${randomUUID()}, ${until}, 'active', ${new Date("2030-01-01T09:00:00Z")}) RETURNING id`;
  await prisma.client.$executeRaw`UPDATE seats SET status = 'held', hold_id = ${hold?.id}::uuid, held_until = ${until} WHERE id = ${seatId}::uuid`;
}

export interface BookingOptions {
  readonly eventId: string;
  readonly seatIds: readonly string[];
  readonly userEmail?: string;
  readonly guestEmail?: string;
  readonly status?: "confirmed" | "rejected";
  readonly createdAt: Date;
}

/** A booking with one ticket per seat (seats become sold). A rejected booking still gets tickets so a test can prove they are filtered out. */
export async function seedBooking(prisma: PrismaService, options: BookingOptions): Promise<string> {
  const db = prisma.client;
  const userId = options.userEmail === undefined ? null : await upsertUser(prisma, options.userEmail);
  const [hold] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO holds (event_id, visitor_hash, user_id, expires_at, status, created_at)
    VALUES (${options.eventId}::uuid, ${userId === null ? randomUUID() : null}, ${userId}::uuid, ${options.createdAt}, 'converted', ${options.createdAt}) RETURNING id`;
  const [booking] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO bookings (hold_id, event_id, user_id, guest_email, status, unit_price_minor, total_minor, currency, created_at)
    VALUES (${hold?.id}::uuid, ${options.eventId}::uuid, ${userId}::uuid, ${options.guestEmail ?? null}, ${options.status ?? "confirmed"}, 5000, ${5000 * options.seatIds.length}, 'EUR', ${options.createdAt})
    RETURNING id`;
  for (const seatId of options.seatIds) {
    await db.$executeRaw`UPDATE seats SET status = 'sold', hold_id = NULL, held_until = NULL WHERE id = ${seatId}::uuid`;
    await db.$executeRaw`
      INSERT INTO tickets (booking_id, seat_id, code, created_at)
      VALUES (${booking?.id}::uuid, ${seatId}::uuid, ${`CODE-${randomUUID()}`}, ${options.createdAt})`;
  }
  return booking?.id ?? "";
}

async function upsertUser(prisma: PrismaService, email: string): Promise<string> {
  const [user] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO users (email, created_at) VALUES (${email}, ${new Date("2030-01-01T09:00:00Z")})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`;
  return user?.id ?? "";
}
