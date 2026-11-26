import type { MyBooking } from "./list-my-bookings-query.js";
import { toMyTickets } from "./list-my-bookings-query.js";
import type { GuestBookingReader } from "./ports/guest-booking-reader.js";
import type { StoredMyBooking } from "./ports/my-bookings-reader.js";

/** Public reads of guest bookings for the guest-access module. Same DTO shape as My bookings. */
export class GuestBookingsQuery {
  constructor(private readonly deps: { readonly reader: GuestBookingReader }) {}

  /** The booking without tickets (checkout and exchange need only the event). */
  findConfirmedGuestBooking(bookingId: string): Promise<StoredMyBooking | null> {
    return this.deps.reader.findConfirmed(bookingId);
  }

  async getConfirmedBookingWithTickets(bookingId: string): Promise<MyBooking | null> {
    const booking = await this.deps.reader.findConfirmed(bookingId);
    if (booking === null) return null;
    return { ...booking, status: "confirmed", tickets: toMyTickets(await this.deps.reader.findTickets(bookingId)) };
  }

  findUpcomingConfirmedGuestBookingsByEmail(email: string, now: Date): Promise<StoredMyBooking[]> {
    return this.deps.reader.listUpcomingConfirmedByEmail(email, now);
  }
}
