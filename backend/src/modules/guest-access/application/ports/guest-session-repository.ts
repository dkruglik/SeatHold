import type { GuestSession } from "../../domain/guest-session.js";

export interface NewGuestSession {
  readonly bookingId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

/** Persistence port for guest sessions, looked up by the hash of the cookie token. */
export interface GuestSessionRepository {
  create(session: NewGuestSession): Promise<GuestSession>;
  /** The session, or null when unknown, revoked, or expired at `now`. */
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<GuestSession | null>;
  /** Revokes the active sessions of these bookings; a revoked session keeps its first revocation time. */
  revokeForBookings(bookingIds: readonly string[], now: Date): Promise<void>;
}
