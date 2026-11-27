import type { StoredMyBooking, StoredMyTicket } from "./my-bookings-reader.js";

/** Reads of guest bookings (`guest_email` set, no user) for the guest-access module, through booking's public query. */
export interface GuestBookingReader {
  /** The confirmed guest booking with its event, or null when unknown, rejected, or owned by a user. */
  findConfirmed(bookingId: string): Promise<StoredMyBooking | null>;
  findTickets(bookingId: string): Promise<StoredMyTicket[]>;
  /** Confirmed guest bookings of this email (case-insensitive) whose event starts after `now`. */
  listUpcomingConfirmedByEmail(email: string, now: Date): Promise<StoredMyBooking[]>;
}
