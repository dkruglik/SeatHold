import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./load-config.js";

const databaseUrl = "postgresql://dbuser:s3cr3t-pass@db.internal:5432/seatholder";
const pepper = "unit-test-pepper-0123456789-abcdefghij";
const localEnv = { DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: pepper, CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef" };
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

describe("loadConfig COOKIE_SECURE", () => {
  it("defaults to false locally", () => {
    expect(loadConfig(localEnv).cookieSecure).toBe(false);
  });

  it.each([
    ["true", true],
    ["false", false],
  ])("reads %s locally", (value, expected) => {
    expect(loadConfig({ ...localEnv, COOKIE_SECURE: value }).cookieSecure).toBe(expected);
  });

  it.each(["yes", "1", "TRUE", "on"])("rejects %s, naming the variable only", (value) => {
    const error = failureOf({ ...localEnv, COOKIE_SECURE: value });

    expect(error.variables).toEqual(["COOKIE_SECURE"]);
    expect(error.message).not.toContain(`: ${value}`);
  });

  it("is required to be true in production", () => {
    expect(loadConfig(productionEnv).cookieSecure).toBe(true);
    expect(failureOf({ ...productionEnv, COOKIE_SECURE: undefined }).variables).toEqual(["COOKIE_SECURE"]);
    expect(failureOf({ ...productionEnv, COOKIE_SECURE: "false" }).variables).toEqual(["COOKIE_SECURE"]);
  });
});

describe("loadConfig SESSION_TTL_DAYS", () => {
  it("defaults to 30", () => {
    expect(loadConfig(localEnv).sessionTtlDays).toBe(30);
  });

  it("reads an explicit positive integer", () => {
    expect(loadConfig({ ...localEnv, SESSION_TTL_DAYS: "7" }).sessionTtlDays).toBe(7);
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects %s", (value) => {
    expect(failureOf({ ...localEnv, SESSION_TTL_DAYS: value }).variables).toEqual(["SESSION_TTL_DAYS"]);
  });
});
