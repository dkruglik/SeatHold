import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { BoughtTicketRow, EventHeader, EventTicketsReader, OpenTicketRow, PageCriteria, Rows } from "../../application/ports/admin-readers.js";
import { guarded } from "./persistence-errors.js";

interface OpenRow {
  readonly id: string;
  readonly row_label: string;
  readonly seat_number: number;
  readonly held_until: Date | null;
  readonly is_held: boolean;
  readonly is_releasable: boolean;
}

interface BoughtRow {
  readonly ticket_id: string;
  readonly row_label: string;
  readonly seat_number: number;
  readonly buyer_email: string;
  readonly is_user: boolean;
  readonly created_at: Date;
}

/**
 * Back-office read model for one event's seats and tickets (read-only SQL over the shared tables). Both lists are cut by
 * LIMIT/OFFSET over a total order, so pages never overlap. Ticket codes and payments are never selected.
 */
export class PrismaEventTicketsReader implements EventTicketsReader {
  constructor(private readonly prisma: PrismaService) {}

  findHeader(eventId: string): Promise<EventHeader | null> {
    return guarded("find admin event header", async () => {
      const [row] = await this.prisma.client.$queryRaw<{ title: string; starts_at: Date; venue_name: string; city: string; timezone: string }[]>`
        SELECT sh.title, e.starts_at, v.name AS venue_name, v.city, v.timezone
        FROM events e JOIN shows sh ON sh.id = e.show_id JOIN venues v ON v.id = e.venue_id WHERE e.id = ${eventId}::uuid`;
      return row === undefined ? null : { eventId, showTitle: row.title, startsAt: row.starts_at, venueName: row.venue_name, city: row.city, timezone: row.timezone };
    });
  }

  /** Every seat that is not sold: a live hold (`held_until > now`) is shown as held, an ended hold as available (but still `releasable`, since its stored status is held). Row order: shorter label first (AA after Z). */
  listOpen(c: PageCriteria & { readonly eventId: string; readonly now: Date }): Promise<Rows<OpenTicketRow>> {
    return guarded("list open tickets", async () => {
      const [counted, rows] = await Promise.all([
        this.prisma.client.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM seats WHERE event_id = ${c.eventId}::uuid AND status <> 'sold'`,
        this.prisma.client.$queryRaw<OpenRow[]>`
          SELECT id, row_label, seat_number, held_until, (status = 'held' AND held_until > ${c.now}::timestamptz) AS is_held, (status = 'held') AS is_releasable
          FROM seats WHERE event_id = ${c.eventId}::uuid AND status <> 'sold'
          ORDER BY length(row_label), row_label COLLATE "C", seat_number
          LIMIT ${c.limit} OFFSET ${c.offset}`,
      ]);
      return { total: counted[0]?.total ?? 0, rows: rows.map(toOpen) };
    });
  }

  /** Tickets of confirmed bookings, oldest booking first, then seat order (a booking's tickets share its time), then ticket id. */
  listBought(c: PageCriteria & { readonly eventId: string }): Promise<Rows<BoughtTicketRow>> {
    return guarded("list bought tickets", async () => {
      const [counted, rows] = await Promise.all([
        this.prisma.client.$queryRaw<{ total: number }[]>`
          SELECT count(*)::int AS total FROM tickets t JOIN bookings b ON b.id = t.booking_id WHERE b.event_id = ${c.eventId}::uuid AND b.status = 'confirmed'`,
        this.prisma.client.$queryRaw<BoughtRow[]>`
          SELECT t.id AS ticket_id, s.row_label, s.seat_number, COALESCE(u.email, b.guest_email) AS buyer_email,
                 (b.user_id IS NOT NULL) AS is_user, b.created_at
          FROM tickets t JOIN bookings b ON b.id = t.booking_id JOIN seats s ON s.id = t.seat_id LEFT JOIN users u ON u.id = b.user_id
          WHERE b.event_id = ${c.eventId}::uuid AND b.status = 'confirmed'
          ORDER BY b.created_at, length(s.row_label), s.row_label COLLATE "C", s.seat_number, t.id
          LIMIT ${c.limit} OFFSET ${c.offset}`,
      ]);
      return { total: counted[0]?.total ?? 0, rows: rows.map(toBought) };
    });
  }
}

const toOpen = (r: OpenRow): OpenTicketRow => ({
  seatId: r.id, row: r.row_label, number: r.seat_number, state: r.is_held ? "held" : "available", heldUntil: r.is_held ? r.held_until : null, releasable: r.is_releasable,
});

const toBought = (r: BoughtRow): BoughtTicketRow => ({
  ticketId: r.ticket_id, row: r.row_label, number: r.seat_number, buyerEmail: r.buyer_email, buyerType: r.is_user ? "user" : "guest", bookedAt: r.created_at,
});
