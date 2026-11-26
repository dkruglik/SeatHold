import { createHash, randomBytes } from "node:crypto";
import type { GuestTokens } from "../../application/ports/guest-tokens.js";

export class CryptoGuestTokens implements GuestTokens {
  generate(): string {
    return randomBytes(32).toString("base64url");
  }

  hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
