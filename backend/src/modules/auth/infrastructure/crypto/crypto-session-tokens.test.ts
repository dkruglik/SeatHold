import { describe, expect, it } from "vitest";
import { CryptoSessionTokens } from "./crypto-session-tokens.js";

describe("CryptoSessionTokens", () => {
  const tokens = new CryptoSessionTokens();

  it("generates 32 random bytes as base64url, different every time", () => {
    const first = tokens.generate();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokens.generate()).not.toBe(first);
  });

  it("hashes with SHA-256 as 64 hex characters, never returning the token", () => {
    expect(tokens.hash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
