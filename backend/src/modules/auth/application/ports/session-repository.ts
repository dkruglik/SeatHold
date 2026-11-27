import type { ActiveSession, Session } from "../../domain/session.js";

export interface NewSession {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

/** Persistence port for sessions, looked up by the hash of the cookie token. */
export interface SessionRepository {
  create(session: NewSession): Promise<Session>;
  /** The session with its user, or null when unknown, revoked, or expired at `now`. */
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<ActiveSession | null>;
  /** Revokes once; a second call keeps the first revocation time. */
  revoke(sessionId: string, now: Date): Promise<void>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
}
