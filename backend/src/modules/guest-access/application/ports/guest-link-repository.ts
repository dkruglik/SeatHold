import type { GuestAccessLink } from "../../domain/guest-access-link.js";
import type { GuestLinkState } from "../../domain/guest-link-state.js";

export interface NewGuestLink {
  readonly bookingId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

/** Persistence port for guest links, looked up by the hash of the emailed token. Every time comes from the caller's `now`. */
export interface GuestLinkRepository {
  create(link: NewGuestLink): Promise<GuestAccessLink>;
  /** Marks the link consumed in one conditional statement and returns its booking id; null when it is unknown, used, invalidated or expired. */
  consumeByTokenHash(tokenHash: string, now: Date): Promise<string | null>;
  /** Why a link is not consumable. Read only after a failed consume. */
  findStateByTokenHash(tokenHash: string, now: Date): Promise<GuestLinkState>;
  /** Invalidates the unused links of these bookings; consumed links are left alone. */
  invalidateUnusedForBookings(bookingIds: readonly string[], now: Date): Promise<void>;
}
