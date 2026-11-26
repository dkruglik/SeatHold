import type { MyBooking } from "../../booking/index.js";
import type { Clock } from "../../../shared/time/clock.js";
import { LinkInvalid, guestLinkErrorFor } from "../domain/errors.js";
import type { GuestBookings } from "./ports/guest-bookings.js";
import type { GuestLinkRepository } from "./ports/guest-link-repository.js";
import type { GuestTokens } from "./ports/guest-tokens.js";

export interface ExchangeGuestLinkDeps {
  readonly clock: Clock;
  readonly links: GuestLinkRepository;
  readonly tokens: GuestTokens;
  readonly bookings: GuestBookings;
}

export interface ExchangeResult {
  /** The raw session token for the cookie; only its hash is stored. */
  readonly sessionToken: string;
  readonly expiresAt: Date;
  /** The booking read for the session, so the caller needs no second lookup. */
  readonly booking: MyBooking;
}

const MS_PER_DAY = 86_400_000;

/**
 * Plan flow 4. The link is read (not consumed), the booking is read, and only then one statement consumes the link and
 * creates the session: of any number of concurrent exchanges one wins, and no failure before it burns the link. A failure
 * says only LINK_USED, LINK_EXPIRED or LINK_INVALID (410) and nothing about bookings or emails.
 */
export class ExchangeGuestLinkService {
  constructor(private readonly deps: ExchangeGuestLinkDeps) {}

  async exchange(input: { token: string }): Promise<ExchangeResult> {
    const { clock, links, tokens, bookings } = this.deps;
    const now = await clock.now();
    const tokenHash = tokens.hash(input.token);
    const bookingId = await links.findUsableBookingIdByTokenHash(tokenHash, now);
    if (bookingId === null) return this.rejectUnusable(tokenHash, now);
    const booking = await bookings.getConfirmedBookingWithTickets(bookingId);
    if (booking === null) throw new LinkInvalid();
    const sessionToken = tokens.generate();
    const expiresAt = new Date(booking.event.startsAt.getTime() + MS_PER_DAY);
    const consumed = await links.consumeAndCreateSession({ tokenHash, sessionTokenHash: tokens.hash(sessionToken), sessionExpiresAt: expiresAt, now });
    if (consumed === null) return this.rejectUnusable(tokenHash, now);
    return { sessionToken, expiresAt, booking };
  }

  private async rejectUnusable(tokenHash: string, now: Date): Promise<never> {
    const state = await this.deps.links.findStateByTokenHash(tokenHash, now);
    throw state === "usable" ? new LinkInvalid() : guestLinkErrorFor(state);
  }
}
