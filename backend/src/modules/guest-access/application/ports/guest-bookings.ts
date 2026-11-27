import type { GuestBookingsQuery } from "../../../booking/index.js";

/** What guest access reads from the booking module: only its public query. */
export type GuestBookings = Pick<GuestBookingsQuery, "findConfirmedGuestBooking" | "getConfirmedBookingWithTickets" | "findUpcomingConfirmedGuestBookingsByEmail">;
