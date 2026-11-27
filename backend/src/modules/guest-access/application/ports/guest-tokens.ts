/** Makes unguessable tokens and the stored form of them (and of an email for the resend limiter). */
export interface GuestTokens {
  /** 32 random bytes, base64url. */
  generate(): string;
  /** SHA-256 hex. A token is high-entropy, so no salt or pepper is needed. */
  hash(value: string): string;
}
