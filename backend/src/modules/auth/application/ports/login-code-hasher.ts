/** Turns a code into the value that is stored, and checks a submitted code against a stored value. The plaintext is never stored. */
export interface LoginCodeHasher {
  hash(code: string): string;
  /** Constant-time comparison of the hash of `code` with a stored hash. */
  matches(code: string, storedHash: string): boolean;
}
