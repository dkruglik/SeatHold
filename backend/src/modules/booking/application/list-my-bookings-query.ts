import type { MyBookingsReader, StoredMyBooking, StoredMyTicket } from "./ports/my-bookings-reader.js";

/** The most bookings one call returns (the latest ones). */
export const MY_BOOKINGS_LIMIT = 100;

export interface MyTicket {
  readonly ticketId: string;
  readonly code: string;
  readonly rowLabel: string;
  readonly seatNumber: number;
}

export interface MyBooking extends StoredMyBooking {
  readonly status: "confirmed";
  readonly tickets: readonly MyTicket[];
}

/** Row labels run A..Z, AA..: a shorter label sorts first, then alphabetically. */
const bySeat = (a: StoredMyTicket, b: StoredMyTicket): number =>
  a.rowLabel.length - b.rowLabel.length || (a.rowLabel < b.rowLabel ? -1 : a.rowLabel > b.rowLabel ? 1 : 0) || a.seatNumber - b.seatNumber;

/**
 * The signed-in user's tickets (plan section 3: ownership is filtered in the query). Only `confirmed` bookings are listed;
 * a `rejected` booking never produced a ticket and is not shown. Newest first, at most `MY_BOOKINGS_LIMIT`.
 */
export class ListMyBookingsQuery {
  constructor(private readonly deps: { readonly reader: MyBookingsReader }) {}

  async execute(input: { userId: string }): Promise<MyBooking[]> {
    const { bookings, tickets } = await this.deps.reader.listConfirmed(input.userId, MY_BOOKINGS_LIMIT);
    const byBooking = new Map<string, StoredMyTicket[]>();
    for (const t of tickets) byBooking.set(t.bookingId, [...(byBooking.get(t.bookingId) ?? []), t]);
    return bookings.map((b) => ({
      ...b,
      status: "confirmed",
      tickets: (byBooking.get(b.bookingId) ?? []).sort(bySeat).map((t) => ({ ticketId: t.ticketId, code: t.code, rowLabel: t.rowLabel, seatNumber: t.seatNumber })),
    }));
  }
}
