/** Makes session tokens and the value stored for them. The raw token goes to the browser once and is never stored. */
export interface SessionTokens {
  /** An unguessable token. */
  generate(): string;
  /** The stored form of a token. A lookup hashes the presented token with this and compares hashes. */
  hash(token: string): string;
}
