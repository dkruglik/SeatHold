import type { Clock } from "../../../shared/time/clock.js";
import { LinkInvalid, guestLinkErrorFor } from "../domain/errors.js";
import type { GuestBookings } from "./ports/guest-bookings.js";
import type { GuestLinkRepository } from "./ports/guest-link-repository.js";
import type { GuestSessionRepository } from "./ports/guest-session-repository.js";
import type { GuestTokens } from "./ports/guest-tokens.js";

export interface ExchangeGuestLinkDeps {
  readonly clock: Clock;
  readonly links: GuestLinkRepository;
  readonly sessions: GuestSessionRepository;
  readonly tokens: GuestTokens;
  readonly bookings: GuestBookings;
}

export interface ExchangeResult {
  /** The raw session token for the cookie; only its hash is stored. */
  readonly sessionToken: string;
  readonly expiresAt: Date;
  readonly bookingId: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * Plan flow 4. The consume is one conditional UPDATE, so of any number of concurrent exchanges one wins and creates the
 * session. A failure says only LINK_USED, LINK_EXPIRED or LINK_INVALID (410) and nothing about bookings or emails.
 */
export class ExchangeGuestLinkService {
  constructor(private readonly deps: ExchangeGuestLinkDeps) {}

  async exchange(input: { token: string }): Promise<ExchangeResult> {
    const { clock, links, sessions, tokens, bookings } = this.deps;
    const now = await clock.now();
    const tokenHash = tokens.hash(input.token);
    const bookingId = await links.consumeByTokenHash(tokenHash, now);
    if (bookingId === null) {
      const state = await links.findStateByTokenHash(tokenHash, now);
      throw state === "usable" ? new LinkInvalid() : guestLinkErrorFor(state);
    }
    const booking = await bookings.findConfirmedGuestBooking(bookingId);
    if (booking === null) throw new LinkInvalid();
    const sessionToken = tokens.generate();
    const expiresAt = new Date(booking.event.startsAt.getTime() + MS_PER_DAY);
    await sessions.create({ bookingId, tokenHash: tokens.hash(sessionToken), expiresAt, now });
    return { sessionToken, expiresAt, bookingId };
  }
}
