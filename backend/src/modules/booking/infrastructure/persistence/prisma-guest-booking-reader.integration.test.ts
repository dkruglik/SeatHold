import { describe, expect, it } from "vitest";
import { PrismaGuestBookingReader } from "./prisma-guest-booking-reader.js";
import { insertSeatedEvent, insertUser, T0, useBookingPool } from "./booking-test-support.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";

async function insertBooking(prisma: PrismaService, eventId: string, seatId: string | null, options: { email?: string; userId?: string; status?: string }): Promise<string> {
  const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO holds (event_id, visitor_hash, expires_at, status, created_at) VALUES (${eventId}::uuid, ${`v${Math.random()}`}, ${T0}, 'converted', ${T0}) RETURNING id`;
  const [b] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO bookings (hold_id, event_id, guest_email, user_id, status, unit_price_minor, total_minor, currency, created_at)
    VALUES (${hold?.id}::uuid, ${eventId}::uuid, ${options.email ?? null}, ${options.userId ?? null}::uuid, ${options.status ?? "confirmed"}, 5000, 5000, 'EUR', ${T0}) RETURNING id`;
  if (seatId !== null) {
    await prisma.client.$executeRaw`INSERT INTO tickets (booking_id, seat_id, code, created_at) VALUES (${b?.id}::uuid, ${seatId}::uuid, ${`code-${seatId}`}, ${T0})`;
  }
  return b?.id ?? "";
}

describe("PrismaGuestBookingReader", () => {
  const prisma = useBookingPool();
  const reader = () => new PrismaGuestBookingReader(prisma);

  it("finds a confirmed guest booking with its tickets, and not a user booking or a rejected one", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 3);
    const userId = await insertUser(prisma, "u@example.com");
    const guest = await insertBooking(prisma, eventId, seatIds[0] as string, { email: "g@example.com" });
    const owned = await insertBooking(prisma, eventId, seatIds[1] as string, { userId });
    const rejected = await insertBooking(prisma, eventId, null, { email: "g@example.com", status: "rejected" });

    expect((await reader().findConfirmed(guest))?.event.title).toBe("Show");
    expect(await reader().findConfirmed(owned)).toBeNull();
    expect(await reader().findConfirmed(rejected)).toBeNull();
    expect((await reader().findTickets(guest)).map((t) => t.code)).toEqual([`code-${seatIds[0]}`]);
  });

  it("lists upcoming confirmed guest bookings by email case-insensitively, excluding started events and other emails", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    const mine = await insertBooking(prisma, eventId, seatIds[0] as string, { email: "g@example.com" });
    await insertBooking(prisma, eventId, seatIds[1] as string, { email: "other@example.com" });

    const found = await reader().listUpcomingConfirmedByEmail("G@Example.COM", new Date("2026-01-15T00:00:00Z"));
    const started = await reader().listUpcomingConfirmedByEmail("g@example.com", new Date("2026-02-01T12:00:00Z"));

    expect(found.map((b) => b.bookingId)).toEqual([mine]);
    expect(started).toEqual([]);
  });
});
