/** `retryAfterSeconds` is the same for every email at the same load: the limiter runs before any booking lookup. */
export type ResendAttempt = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/** Database-backed rate limit for "send my links again", per email (shared by every instance). */
export interface GuestResendLimiter {
  /**
   * Atomically counts the attempts of `emailHash` in the last `windowMinutes` before `now` and records this one
   * when fewer than `limit` exist. A refusal records nothing and says in how many seconds (at least 1) the oldest
   * attempt in the window leaves it, so one more attempt fits.
   * `emailHash` is the SHA-256 of the lower-cased email; the address itself never reaches the database.
   */
  tryRegister(emailHash: string, now: Date, limit: number, windowMinutes: number): Promise<ResendAttempt>;
}
