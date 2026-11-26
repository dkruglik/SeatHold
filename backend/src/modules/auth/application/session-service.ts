import type { Clock } from "../../../shared/time/clock.js";
import type { ActiveSession } from "../domain/session.js";
import type { SessionRepository } from "./ports/session-repository.js";
import type { SessionTokens } from "./ports/session-tokens.js";

const MS_PER_DAY = 86_400_000;

export interface SessionServiceDeps {
  readonly clock: Clock;
  readonly sessions: SessionRepository;
  readonly tokens: SessionTokens;
  /** Fixed lifetime from creation; there is no idle timeout (DECISIONS.md O19). */
  readonly ttlDays: number;
}

export interface CreatedSession {
  /** The raw token for the cookie. Exists only here and in the browser. */
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Starts, checks and ends browser sessions. A session holds the user id only: `authenticate` returns the user as the
 * database has it now, so a role change applies on the next request. Every operation reads the clock once.
 */
export class SessionService {
  constructor(private readonly deps: SessionServiceDeps) {}

  async create(userId: string): Promise<CreatedSession> {
    const now = await this.deps.clock.now();
    const token = this.deps.tokens.generate();
    const expiresAt = new Date(now.getTime() + this.deps.ttlDays * MS_PER_DAY);
    await this.deps.sessions.create({ userId, tokenHash: this.deps.tokens.hash(token), expiresAt, now });
    return { token, expiresAt };
  }

  /** The live session and its user, or null for an unknown, revoked or expired token. */
  async authenticate(token: string): Promise<ActiveSession | null> {
    const now = await this.deps.clock.now();
    return this.deps.sessions.findActiveByTokenHash(this.deps.tokens.hash(token), now);
  }

  async revoke(sessionId: string): Promise<void> {
    await this.deps.sessions.revoke(sessionId, await this.deps.clock.now());
  }

  async revokeAll(userId: string): Promise<void> {
    await this.deps.sessions.revokeAllForUser(userId, await this.deps.clock.now());
  }
}
