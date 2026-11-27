import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { GuestBookingReader } from "../../application/ports/guest-booking-reader.js";
import type { StoredMyBooking, StoredMyTicket } from "../../application/ports/my-bookings-reader.js";
import { guarded } from "../../../../shared/persistence/guarded.js";

interface BookingRow {
  readonly booking_id: string;
  readonly created_at: Date;
  readonly total_minor: number;
  readonly currency: string;
  readonly event_id: string;
  readonly title: string;
  readonly starts_at: Date;
  readonly venue_name: string;
  readonly city: string;
  readonly timezone: string;
}

/** One guest email has few upcoming bookings; the cap only bounds a pathological case. */
const UPCOMING_LIMIT = 50;

const toBooking = (r: BookingRow): StoredMyBooking => ({
  bookingId: r.booking_id, createdAt: r.created_at, totalMinor: r.total_minor, currency: r.currency,
  event: { eventId: r.event_id, title: r.title, startsAt: r.starts_at, venueName: r.venue_name, city: r.city, timezone: r.timezone },
});

/** Guest bookings only: `guest_email IS NOT NULL AND user_id IS NULL` is in every statement, so a user's booking is never reachable here. */
export class PrismaGuestBookingReader implements GuestBookingReader {
  constructor(private readonly prisma: PrismaService) {}

  findConfirmed(bookingId: string): Promise<StoredMyBooking | null> {
    return guarded("find guest booking", async () => {
      const rows = await this.prisma.client.$queryRaw<BookingRow[]>`
        SELECT b.id AS booking_id, b.created_at, b.total_minor, b.currency, e.id AS event_id, sh.title, e.starts_at,
               v.name AS venue_name, v.city, v.timezone
        FROM bookings b JOIN events e ON e.id = b.event_id JOIN shows sh ON sh.id = e.show_id JOIN venues v ON v.id = e.venue_id
        WHERE b.id = ${bookingId}::uuid AND b.status = 'confirmed' AND b.guest_email IS NOT NULL AND b.user_id IS NULL`;
      return rows[0] === undefined ? null : toBooking(rows[0]);
    });
  }

  findTickets(bookingId: string): Promise<StoredMyTicket[]> {
    return guarded("find guest booking tickets", async () => {
      const rows = await this.prisma.client.$queryRaw<{ ticket_id: string; booking_id: string; code: string; row_label: string; seat_number: number }[]>`
        SELECT t.id AS ticket_id, t.booking_id, t.code, s.row_label, s.seat_number
        FROM tickets t JOIN seats s ON s.id = t.seat_id WHERE t.booking_id = ${bookingId}::uuid`;
      return rows.map((r) => ({ ticketId: r.ticket_id, bookingId: r.booking_id, code: r.code, rowLabel: r.row_label, seatNumber: r.seat_number }));
    });
  }

  listUpcomingConfirmedByEmail(email: string, now: Date): Promise<StoredMyBooking[]> {
    return guarded("list upcoming guest bookings", async () => {
      const rows = await this.prisma.client.$queryRaw<BookingRow[]>`
        SELECT b.id AS booking_id, b.created_at, b.total_minor, b.currency, e.id AS event_id, sh.title, e.starts_at,
               v.name AS venue_name, v.city, v.timezone
        FROM bookings b JOIN events e ON e.id = b.event_id JOIN shows sh ON sh.id = e.show_id JOIN venues v ON v.id = e.venue_id
        WHERE b.guest_email = ${email}::citext AND b.user_id IS NULL AND b.status = 'confirmed' AND e.starts_at > ${now}
        ORDER BY e.starts_at, b.id
        LIMIT ${UPCOMING_LIMIT}`;
      return rows.map(toBooking);
    });
  }
}
