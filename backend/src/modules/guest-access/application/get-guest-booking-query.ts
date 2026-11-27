import type { MyBooking } from "../../booking/index.js";
import { AuthenticationError } from "../../../shared/errors/app-error.js";
import type { Clock } from "../../../shared/time/clock.js";
import type { GuestBookings } from "./ports/guest-bookings.js";
import type { GuestSessionRepository } from "./ports/guest-session-repository.js";
import type { GuestTokens } from "./ports/guest-tokens.js";

export interface GetGuestBookingDeps {
  readonly clock: Clock;
  readonly sessions: GuestSessionRepository;
  readonly tokens: GuestTokens;
  readonly bookings: GuestBookings;
}

/** The one booking a guest session is scoped to, with its tickets. An unknown, revoked or expired session is 401. */
export class GetGuestBookingQuery {
  constructor(private readonly deps: GetGuestBookingDeps) {}

  async get(input: { sessionToken: string }): Promise<MyBooking> {
    const { clock, sessions, tokens, bookings } = this.deps;
    const now = await clock.now();
    const session = await sessions.findActiveByTokenHash(tokens.hash(input.sessionToken), now);
    const booking = session === null ? null : await bookings.getConfirmedBookingWithTickets(session.bookingId);
    if (booking === null) throw new AuthenticationError("Authentication required", { publicCode: "UNAUTHENTICATED" });
    return booking;
  }
}
