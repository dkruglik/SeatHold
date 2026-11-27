import { createHmac } from "node:crypto";
import type { LoginCodeHasher } from "../../application/ports/login-code-hasher.js";
import { safeEqualHex } from "./timing-safe.js";

const MIN_PEPPER_LENGTH = 32;

/** HMAC-SHA256 of the code keyed with the pepper, hex encoded. The pepper is passed in by composition; config validates it too. */
export class HmacLoginCodeHasher implements LoginCodeHasher {
  constructor(private readonly pepper: string) {
    if (pepper.length < MIN_PEPPER_LENGTH) {
      throw new Error(`The login code pepper must be at least ${MIN_PEPPER_LENGTH} characters`);
    }
  }

  hash(code: string): string {
    return createHmac("sha256", this.pepper).update(code).digest("hex");
  }

  matches(code: string, storedHash: string): boolean {
    return safeEqualHex(this.hash(code), storedHash);
  }
}
