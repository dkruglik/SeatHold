/** Database-backed rate limit for "send my links again", per email (shared by every instance). */
export interface GuestResendLimiter {
  /**
   * Atomically counts the attempts of `emailHash` in the last `windowMinutes` before `now` and records this one
   * when fewer than `limit` exist. False means the limit is hit and nothing was recorded.
   * `emailHash` is the SHA-256 of the lower-cased email; the address itself never reaches the database.
   */
  tryRegister(emailHash: string, now: Date, limit: number, windowMinutes: number): Promise<boolean>;
}
