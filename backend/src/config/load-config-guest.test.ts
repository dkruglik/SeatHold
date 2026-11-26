import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./load-config.js";

const databaseUrl = "postgresql://dbuser:s3cr3t-pass@db.internal:5432/seatholder";
const pepper = "unit-test-pepper-0123456789-abcdefghij";
const localEnv = { DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: pepper, CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef" };

function failureOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error("loadConfig did not throw");
}

describe("loadConfig guest access settings", () => {
  it("applies the defaults when unset", () => {
    const config = loadConfig(localEnv);

    expect(config.guestLinkTtlHours).toBe(168);
    expect(config.guestResendLimit).toBe(3);
    expect(config.guestResendWindowMinutes).toBe(60);
  });

  it("reads explicit valid values", () => {
    const config = loadConfig({ ...localEnv, GUEST_LINK_TTL_HOURS: "24", GUEST_RESEND_LIMIT: "5", GUEST_RESEND_WINDOW_MINUTES: "30" });

    expect(config.guestLinkTtlHours).toBe(24);
    expect(config.guestResendLimit).toBe(5);
    expect(config.guestResendWindowMinutes).toBe(30);
  });

  describe.each(["GUEST_LINK_TTL_HOURS", "GUEST_RESEND_LIMIT", "GUEST_RESEND_WINDOW_MINUTES"])("%s", (name) => {
    it.each(["0", "-1", "1.5", "abc"])("rejects %s with the standard requirement message", (value) => {
      const error = failureOf({ ...localEnv, [name]: value });

      expect(error.variables).toEqual([name]);
      expect(error.message).toBe(`Invalid configuration: ${name} must be a positive integer`);
    });
  });
});
