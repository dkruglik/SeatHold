import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { MyBookingsReader, StoredMyBookings, StoredMyTicket } from "../../application/ports/my-bookings-reader.js";
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

interface TicketRow {
  readonly ticket_id: string;
  readonly booking_id: string;
  readonly code: string;
  readonly row_label: string;
  readonly seat_number: number;
}

/**
 * Two statements: the user's latest confirmed bookings with event, show and venue (served by `bookings(user_id, created_at DESC)`),
 * then the tickets of those bookings in one query. `user_id = $1` is in the SQL itself, so another user's booking can never be read.
 */
export class PrismaMyBookingsReader implements MyBookingsReader {
  constructor(private readonly prisma: PrismaService) {}

  listConfirmed(userId: string, limit: number): Promise<StoredMyBookings> {
    return guarded("list my bookings", async () => {
      const rows = await this.prisma.client.$queryRaw<BookingRow[]>`
        SELECT b.id AS booking_id, b.created_at, b.total_minor, b.currency, e.id AS event_id, sh.title, e.starts_at,
               v.name AS venue_name, v.city, v.timezone
        FROM bookings b JOIN events e ON e.id = b.event_id JOIN shows sh ON sh.id = e.show_id JOIN venues v ON v.id = e.venue_id
        WHERE b.user_id = ${userId}::uuid AND b.status = 'confirmed'
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT ${limit}`;
      if (rows.length === 0) return { bookings: [], tickets: [] };
      const tickets = await this.prisma.client.$queryRaw<TicketRow[]>`
        SELECT t.id AS ticket_id, t.booking_id, t.code, s.row_label, s.seat_number
        FROM tickets t JOIN seats s ON s.id = t.seat_id
        WHERE t.booking_id = ANY(${rows.map((r) => r.booking_id)}::uuid[])`;
      return { bookings: rows.map(toBooking), tickets: tickets.map(toTicket) };
    });
  }
}

const toBooking = (r: BookingRow): StoredMyBookings["bookings"][number] => ({
  bookingId: r.booking_id, createdAt: r.created_at, totalMinor: r.total_minor, currency: r.currency,
  event: { eventId: r.event_id, title: r.title, startsAt: r.starts_at, venueName: r.venue_name, city: r.city, timezone: r.timezone },
});

const toTicket = (r: TicketRow): StoredMyTicket => ({ ticketId: r.ticket_id, bookingId: r.booking_id, code: r.code, rowLabel: r.row_label, seatNumber: r.seat_number });
