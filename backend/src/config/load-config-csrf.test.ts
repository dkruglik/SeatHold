import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, localCsrfSecretPlaceholder } from "./load-config.js";

const databaseUrl = "postgresql://dbuser:s3cr3t-pass@db.internal:5432/seatholder";
const pepper = "unit-test-pepper-0123456789-abcdefghij";
const csrfSecret = "unit-test-csrf-secret-0123456789-abcdef";
const localEnv = { DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: pepper, CSRF_SECRET: csrfSecret };
const productionEnv = { ...localEnv, APP_ENV: "production", FRONTEND_ORIGIN: "https://seats.example.com", COOKIE_SECURE: "true" };

function failureOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error("loadConfig did not throw");
}

describe("loadConfig CSRF_SECRET", () => {
  it("is exposed as csrfSecret", () => {
    expect(loadConfig(localEnv).csrfSecret).toBe(csrfSecret);
  });

  it("is required in every environment", () => {
    expect(failureOf({ ...localEnv, CSRF_SECRET: undefined }).variables).toEqual(["CSRF_SECRET"]);
    expect(failureOf({ ...productionEnv, CSRF_SECRET: undefined }).variables).toEqual(["CSRF_SECRET"]);
  });

  it("must be at least 32 characters", () => {
    expect(failureOf({ ...localEnv, CSRF_SECRET: "x".repeat(31) }).variables).toEqual(["CSRF_SECRET"]);
    expect(loadConfig({ ...localEnv, CSRF_SECRET: "x".repeat(32) }).csrfSecret).toBe("x".repeat(32));
  });

  it("names the variable and never prints the value", () => {
    const short = "short-csrf-secret";
    const error = failureOf({ ...localEnv, CSRF_SECRET: short });

    expect(error.message).toContain("CSRF_SECRET");
    expect(error.message).not.toContain(short);
  });

  it("allows the local placeholder locally but refuses it in production", () => {
    expect(loadConfig({ ...localEnv, CSRF_SECRET: localCsrfSecretPlaceholder }).csrfSecret).toBe(localCsrfSecretPlaceholder);
    expect(localCsrfSecretPlaceholder.length).toBeGreaterThanOrEqual(32);
    expect(failureOf({ ...productionEnv, CSRF_SECRET: localCsrfSecretPlaceholder }).variables).toEqual(["CSRF_SECRET"]);
  });

  it("accepts a real value in production", () => {
    expect(loadConfig(productionEnv).csrfSecret).toBe(csrfSecret);
  });
});
