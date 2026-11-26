import type { GuestAccessLink } from "../../domain/guest-access-link.js";
import type { GuestLinkState } from "../../domain/guest-link-state.js";

export interface NewGuestLink {
  readonly bookingId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

export interface ConsumeAndCreateSession {
  readonly tokenHash: string;
  readonly sessionTokenHash: string;
  readonly sessionExpiresAt: Date;
  readonly now: Date;
}

/** Persistence port for guest links, looked up by the hash of the emailed token. Every time comes from the caller's `now`. */
export interface GuestLinkRepository {
  create(link: NewGuestLink): Promise<GuestAccessLink>;
  /** The booking id of a link that is neither consumed, invalidated nor expired at `now`; null otherwise. Read only: nothing is consumed. */
  findUsableBookingIdByTokenHash(tokenHash: string, now: Date): Promise<string | null>;
  /**
   * Consumes the link and creates its guest session in one statement, so both rows exist or neither does. Returns the
   * booking id; null when the link is unknown, used, invalidated or expired (a concurrent exchange won, or it was invalidated meanwhile).
   */
  consumeAndCreateSession(input: ConsumeAndCreateSession): Promise<string | null>;
  /** Why a link is not usable. Read only after a failed lookup or consume. */
  findStateByTokenHash(tokenHash: string, now: Date): Promise<GuestLinkState>;
  /** Invalidates the unused links of these bookings; consumed links are left alone. */
  invalidateUnusedForBookings(bookingIds: readonly string[], now: Date): Promise<void>;
}
