import type { Clock } from "../../../shared/time/clock.js";
import type { IssueGuestLinkService } from "./issue-guest-link-service.js";
import type { GuestBookings } from "./ports/guest-bookings.js";
import type { GuestLinkRepository } from "./ports/guest-link-repository.js";
import type { GuestResendLimiter } from "./ports/guest-resend-limiter.js";
import type { GuestSessionRepository } from "./ports/guest-session-repository.js";
import type { GuestTokens } from "./ports/guest-tokens.js";

export interface ResendGuestLinksDeps {
  readonly clock: Clock;
  readonly links: GuestLinkRepository;
  readonly sessions: GuestSessionRepository;
  readonly limiter: GuestResendLimiter;
  readonly bookings: GuestBookings;
  readonly tokens: GuestTokens;
  readonly issue: Pick<IssueGuestLinkService, "issue">;
  readonly limit: number;
  readonly windowMinutes: number;
}

/** `accepted` is the answer for every email, known or not (204); `rate_limited` is the same for every email (429). */
export type ResendResult = { readonly kind: "accepted" } | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number };

/**
 * Plan flow 5. The limiter runs first and counts every attempt, so neither answer depends on whether bookings exist.
 * For known bookings: older unused links are invalidated, guest sessions revoked, one new link emailed per booking.
 */
export class ResendGuestLinksService {
  constructor(private readonly deps: ResendGuestLinksDeps) {}

  async resend(input: { email: string }): Promise<ResendResult> {
    const { clock, links, sessions, limiter, bookings, tokens, issue, limit, windowMinutes } = this.deps;
    const email = input.email.trim().toLowerCase();
    const now = await clock.now();
    const attempt = await limiter.tryRegister(tokens.hash(email), now, limit, windowMinutes);
    if (!attempt.allowed) return { kind: "rate_limited", retryAfterSeconds: attempt.retryAfterSeconds };
    const upcoming = await bookings.findUpcomingConfirmedGuestBookingsByEmail(email, now);
    if (upcoming.length === 0) return { kind: "accepted" };
    const ids = upcoming.map((b) => b.bookingId);
    await links.invalidateUnusedForBookings(ids, now);
    await sessions.revokeForBookings(ids, now);
    for (const b of upcoming) {
      await issue.issue({ bookingId: b.bookingId, email, eventStartsAt: b.event.startsAt, eventTitle: b.event.title });
    }
    return { kind: "accepted" };
  }
}
