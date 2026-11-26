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

describe("loadConfig booking settings", () => {
  it("applies the defaults when unset", () => {
    const config = loadConfig(localEnv);

    expect(config.holdDurationMinutes).toBe(10);
    expect(config.maxSeatsPerHold).toBe(10);
    expect(config.defaultCurrency).toBe("EUR");
  });

  it("reads explicit valid values", () => {
    const config = loadConfig({ ...localEnv, HOLD_DURATION_MINUTES: "15", MAX_SEATS_PER_HOLD: "6", DEFAULT_CURRENCY: "USD" });

    expect(config.holdDurationMinutes).toBe(15);
    expect(config.maxSeatsPerHold).toBe(6);
    expect(config.defaultCurrency).toBe("USD");
  });

  describe.each(["HOLD_DURATION_MINUTES", "MAX_SEATS_PER_HOLD"])("%s", (name) => {
    it.each(["0", "-1", "1.5", "abc"])("rejects %s with the standard requirement message", (value) => {
      const error = failureOf({ ...localEnv, [name]: value });

      expect(error.variables).toEqual([name]);
      expect(error.message).toBe(`Invalid configuration: ${name} must be a positive integer`);
    });
  });

  it.each(["eur", "EURO", "", "E1R", "EU"])("rejects DEFAULT_CURRENCY %j", (value) => {
    const error = failureOf({ ...localEnv, DEFAULT_CURRENCY: value });

    expect(error.variables).toEqual(["DEFAULT_CURRENCY"]);
    expect(error.message).toBe("Invalid configuration: DEFAULT_CURRENCY must be a 3-letter uppercase currency code such as EUR");
  });
});
