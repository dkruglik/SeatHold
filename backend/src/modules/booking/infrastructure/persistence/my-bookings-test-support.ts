import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { T0 } from "./booking-test-support.js";

export interface InsertedBooking {
  readonly bookingId: string;
  readonly codes: readonly string[];
}

/**
 * A converted hold, a booking and one ticket per seat, written by SQL. `status: "rejected"` writes no tickets and leaves
 * the seats as they are, as a rejected checkout does. Ticket codes are `<codePrefix>-<n>`.
 */
export async function insertUserBooking(
  prisma: PrismaService,
  b: { userId: string; eventId: string; seatIds: readonly string[]; createdAt: Date; status?: "confirmed" | "rejected"; codePrefix: string },
): Promise<InsertedBooking> {
  const status = b.status ?? "confirmed";
  const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO holds (event_id, user_id, expires_at, status, created_at)
    VALUES (${b.eventId}::uuid, ${b.userId}::uuid, ${T0}, ${status === "confirmed" ? "converted" : "expired"}, ${b.createdAt}) RETURNING id`;
  const total = 5000 * b.seatIds.length;
  const [booking] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO bookings (hold_id, event_id, user_id, status, unit_price_minor, total_minor, currency, created_at)
    VALUES (${hold?.id}::uuid, ${b.eventId}::uuid, ${b.userId}::uuid, ${status}, 5000, ${total}, 'EUR', ${b.createdAt}) RETURNING id`;
  const codes: string[] = [];
  if (status === "confirmed") {
    for (const [i, seatId] of b.seatIds.entries()) {
      const code = `${b.codePrefix}-${i}`;
      codes.push(code);
      await prisma.client.$executeRaw`
        INSERT INTO tickets (booking_id, seat_id, code, created_at) VALUES (${booking?.id}::uuid, ${seatId}::uuid, ${code}, ${b.createdAt})`;
    }
  }
  return { bookingId: booking?.id ?? "", codes };
}
