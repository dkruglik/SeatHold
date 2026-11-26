import { InfrastructureError } from "../../../shared/errors/app-error.js";
import { emailsEqual } from "../domain/email.js";
import { LoginCode } from "../domain/login-code.js";
import type { Role } from "../domain/role.js";
import { ActiveSession, Session } from "../domain/session.js";
import { User } from "../domain/user.js";
import type { EmailMessage, EmailProvider } from "./ports/email-provider.js";
import type { LoginCodeRepository, NewLoginCode } from "./ports/login-code-repository.js";
import type { NewSession, SessionRepository } from "./ports/session-repository.js";
import type { SessionTokens } from "./ports/session-tokens.js";
import type { UserRepository } from "./ports/user-repository.js";

/** One stored code with the lifecycle columns the real table has. */
export interface StoredCode {
  code: LoginCode;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
}

/** In-memory login codes with the same rules as the Prisma repository. For unit tests only. */
export class InMemoryLoginCodeRepository implements LoginCodeRepository {
  readonly rows: StoredCode[] = [];
  private sequence = 0;

  private forEmail(email: string): StoredCode[] {
    return this.rows.filter((row) => emailsEqual(row.code.email, email));
  }

  countRequestsSince(email: string, since: Date): Promise<number> {
    return Promise.resolve(this.forEmail(email).filter((row) => row.code.createdAt >= since).length);
  }

  latestCreatedAt(email: string): Promise<Date | null> {
    const times = this.forEmail(email).map((row) => row.code.createdAt.getTime());
    return Promise.resolve(times.length === 0 ? null : new Date(Math.max(...times)));
  }

  oldestCreatedAtSince(email: string, since: Date): Promise<Date | null> {
    const times = this.forEmail(email)
      .filter((row) => row.code.createdAt >= since)
      .map((row) => row.code.createdAt.getTime());
    return Promise.resolve(times.length === 0 ? null : new Date(Math.min(...times)));
  }

  invalidateUnused(email: string, now: Date): Promise<void> {
    for (const row of this.forEmail(email)) {
      if (row.consumedAt === null && row.invalidatedAt === null) {
        row.invalidatedAt = now;
      }
    }
    return Promise.resolve();
  }

  create(input: NewLoginCode): Promise<LoginCode> {
    this.sequence += 1;
    const code = new LoginCode(`code-${this.sequence}`, input.email, input.codeHash, input.expiresAt, 0, input.now);
    this.rows.push({ code, consumedAt: null, invalidatedAt: null });
    return Promise.resolve(code);
  }

  findLatestValid(email: string, now: Date): Promise<LoginCode | null> {
    const valid = this.forEmail(email).filter((row) => row.consumedAt === null && row.invalidatedAt === null && row.code.expiresAt > now);
    const latest = valid.reduce<StoredCode | null>((best, row) => (best === null || row.code.createdAt >= best.code.createdAt ? row : best), null);
    return Promise.resolve(latest?.code ?? null);
  }

  incrementAttempts(id: string): Promise<number> {
    const row = this.rows.find((candidate) => candidate.code.id === id);
    if (row === undefined) {
      return Promise.reject(new Error("unknown code"));
    }
    const { code } = row;
    row.code = new LoginCode(code.id, code.email, code.codeHash, code.expiresAt, code.attempts + 1, code.createdAt);
    return Promise.resolve(row.code.attempts);
  }

  consume(id: string, now: Date): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.code.id === id);
    if (row === undefined || row.consumedAt !== null || row.invalidatedAt !== null || row.code.expiresAt <= now) {
      return Promise.resolve(false);
    }
    row.consumedAt = now;
    return Promise.resolve(true);
  }
}

/** In-memory users, case-insensitive by email. For unit tests only. */
export class InMemoryUserRepository implements UserRepository {
  readonly users: User[] = [];

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.users.find((user) => emailsEqual(user.email, email)) ?? null);
  }

  async createBuyer(email: string, now: Date): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing !== null) {
      return existing;
    }
    const user = new User(`user-${this.users.length + 1}`, email, "buyer", now);
    this.users.push(user);
    return user;
  }

  setRoleByEmail(email: string, role: Role): Promise<boolean> {
    const index = this.users.findIndex((user) => emailsEqual(user.email, email));
    const current = this.users[index];
    if (current === undefined || current.role === role) {
      return Promise.resolve(false);
    }
    this.users[index] = new User(current.id, current.email, role, current.createdAt);
    return Promise.resolve(true);
  }
}

/** Records messages instead of sending them; can be told to fail. */
export class RecordingEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  failure: Error | null = null;

  send(message: EmailMessage): Promise<void> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The six-digit code in the latest message. */
  latestCode(): string {
    const text = this.sent.at(-1)?.text ?? "";
    return /\b(\d{6})\b/.exec(text)?.[1] ?? "";
  }
}

export function deliveryFailure(): InfrastructureError {
  return new InfrastructureError("Email delivery failed (ECONNREFUSED)");
}

/** One stored session with its revocation time. */
export interface StoredSession {
  session: Session;
  tokenHash: string;
  revokedAt: Date | null;
}

/** In-memory sessions with the same rules as the Prisma repository; the user is read from the users repository on each lookup. */
export class InMemorySessionRepository implements SessionRepository {
  readonly rows: StoredSession[] = [];

  constructor(private readonly users: InMemoryUserRepository) {}

  create(input: NewSession): Promise<Session> {
    const session = new Session(`session-${this.rows.length + 1}`, input.userId, input.now, input.expiresAt);
    this.rows.push({ session, tokenHash: input.tokenHash, revokedAt: null });
    return Promise.resolve(session);
  }

  async findActiveByTokenHash(tokenHash: string, now: Date): Promise<ActiveSession | null> {
    const row = this.rows.find((candidate) => candidate.tokenHash === tokenHash && candidate.revokedAt === null && candidate.session.expiresAt > now);
    const user = row === undefined ? null : await this.users.findById(row.session.userId);
    return row === undefined || user === null ? null : new ActiveSession(row.session.id, row.session.expiresAt, user);
  }

  revoke(sessionId: string, now: Date): Promise<void> {
    const row = this.rows.find((candidate) => candidate.session.id === sessionId);
    if (row !== undefined && row.revokedAt === null) {
      row.revokedAt = now;
    }
    return Promise.resolve();
  }

  revokeAllForUser(userId: string, now: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.session.userId === userId && row.revokedAt === null) {
        row.revokedAt = now;
      }
    }
    return Promise.resolve();
  }
}

/** Predictable tokens ("token-1", "token-2") and a reversible "hash", so a test can tell what was stored from what was handed out. */
export class SequentialSessionTokens implements SessionTokens {
  private sequence = 0;

  generate(): string {
    this.sequence += 1;
    return `token-${this.sequence}`;
  }

  hash(token: string): string {
    return `hash(${token})`;
  }
}
