import { createHash, randomBytes } from "node:crypto";
import type { SessionTokens } from "../../application/ports/session-tokens.js";

/** 32 random bytes from Node crypto; the stored form is the SHA-256 hex of the token (a token is high-entropy, so no salt or pepper is needed). */
export class CryptoSessionTokens implements SessionTokens {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }

  hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
