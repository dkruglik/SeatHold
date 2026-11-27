import type { LoginCode } from "../../domain/login-code.js";

export interface NewLoginCode {
  readonly email: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

/** Persistence port for login codes. Rate-limit counts come from this table so they hold across instances. */
export interface LoginCodeRepository {
  /** Codes created for the email at or after `since`. */
  countRequestsSince(email: string, since: Date): Promise<number>;
  latestCreatedAt(email: string): Promise<Date | null>;
  /** When the earliest code created for the email at or after `since` was created; null when there is none. */
  oldestCreatedAtSince(email: string, since: Date): Promise<Date | null>;
  /** Marks the email's unconsumed, not yet invalidated codes as invalidated. */
  invalidateUnused(email: string, now: Date): Promise<void>;
  create(code: NewLoginCode): Promise<LoginCode>;
  /** The newest code that is not consumed, not invalidated and not expired at `now`. The attempt limit is the service's rule. */
  findLatestValid(email: string, now: Date): Promise<LoginCode | null>;
  /** Atomically adds one attempt and returns the new count. */
  incrementAttempts(id: string): Promise<number>;
  /** One conditional update. Returns true for exactly one of any number of concurrent callers. */
  consume(id: string, now: Date): Promise<boolean>;
}
