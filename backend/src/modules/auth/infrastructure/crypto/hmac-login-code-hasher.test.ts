import { describe, expect, it } from "vitest";
import { HmacLoginCodeHasher } from "./hmac-login-code-hasher.js";

const pepper = "pepper-one-0123456789-abcdefghijklmnop";

describe("HmacLoginCodeHasher", () => {
  it("returns a hex HMAC-SHA256 that does not contain the code", () => {
    const hash = new HmacLoginCodeHasher(pepper).hash("123456");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("123456");
  });

  it("is stable for the same pepper and code", () => {
    expect(new HmacLoginCodeHasher(pepper).hash("123456")).toBe(new HmacLoginCodeHasher(pepper).hash("123456"));
  });

  it("gives a different hash for a different pepper", () => {
    const other = "pepper-two-0123456789-abcdefghijklmnop";

    expect(new HmacLoginCodeHasher(other).hash("123456")).not.toBe(new HmacLoginCodeHasher(pepper).hash("123456"));
  });

  it("matches the right code and rejects a wrong one or a hash made with another pepper", () => {
    const hasher = new HmacLoginCodeHasher(pepper);
    const stored = hasher.hash("123456");

    expect(hasher.matches("123456", stored)).toBe(true);
    expect(hasher.matches("123457", stored)).toBe(false);
    expect(new HmacLoginCodeHasher("pepper-two-0123456789-abcdefghijklmnop").matches("123456", stored)).toBe(false);
  });

  it("refuses a pepper shorter than 32 characters, without printing it", () => {
    expect(() => new HmacLoginCodeHasher("short-pepper-value")).toThrow(/pepper/i);
    expect(() => new HmacLoginCodeHasher("short-pepper-value")).not.toThrow(/short-pepper-value/);
  });
});
