import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, localPepperPlaceholder } from "./load-config.js";

const databaseUrl = "postgresql://dbuser:s3cr3t-pass@db.internal:5432/seatholder";
const pepper = "unit-test-pepper-0123456789-abcdefghij";
const localEnv = { DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: pepper };
const productionEnv = { ...localEnv, APP_ENV: "production", FRONTEND_ORIGIN: "https://seats.example.com" };

function failureOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error("loadConfig did not throw");
}

describe("loadConfig login code settings", () => {
  it("applies the documented request limits by default", () => {
    expect(loadConfig(localEnv)).toMatchObject({
      authCodePepper: pepper,
      authRequestCodeLimit: 5,
      authRequestCodeWindowMinutes: 15,
      authRequestCodeCooldownSeconds: 60,
    });
  });

  it("reads explicit limits", () => {
    const config = loadConfig({
      ...localEnv,
      AUTH_REQUEST_CODE_LIMIT: "3",
      AUTH_REQUEST_CODE_WINDOW_MINUTES: "30",
      AUTH_REQUEST_CODE_COOLDOWN_SECONDS: "10",
    });

    expect(config).toMatchObject({ authRequestCodeLimit: 3, authRequestCodeWindowMinutes: 30, authRequestCodeCooldownSeconds: 10 });
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects %s as a limit, naming the variable", (value) => {
    expect(failureOf({ ...localEnv, AUTH_REQUEST_CODE_LIMIT: value }).variables).toEqual(["AUTH_REQUEST_CODE_LIMIT"]);
    expect(failureOf({ ...localEnv, AUTH_REQUEST_CODE_WINDOW_MINUTES: value }).variables).toEqual(["AUTH_REQUEST_CODE_WINDOW_MINUTES"]);
    expect(failureOf({ ...localEnv, AUTH_REQUEST_CODE_COOLDOWN_SECONDS: value }).variables).toEqual(["AUTH_REQUEST_CODE_COOLDOWN_SECONDS"]);
  });
});

describe("loadConfig AUTH_CODE_PEPPER", () => {
  it("is required in every environment", () => {
    expect(failureOf({ DATABASE_URL: databaseUrl }).variables).toEqual(["AUTH_CODE_PEPPER"]);
    expect(failureOf({ ...productionEnv, AUTH_CODE_PEPPER: undefined }).variables).toEqual(["AUTH_CODE_PEPPER"]);
  });

  it("must be at least 32 characters", () => {
    expect(failureOf({ ...localEnv, AUTH_CODE_PEPPER: "x".repeat(31) }).variables).toEqual(["AUTH_CODE_PEPPER"]);
    expect(loadConfig({ ...localEnv, AUTH_CODE_PEPPER: "x".repeat(32) }).authCodePepper).toBe("x".repeat(32));
  });

  it("names the variable and never prints the value", () => {
    const short = "short-secret-value";
    const error = failureOf({ ...localEnv, AUTH_CODE_PEPPER: short });

    expect(error.message).toContain("AUTH_CODE_PEPPER");
    expect(error.message).not.toContain(short);
  });

  it("allows the local placeholder locally but refuses it in production", () => {
    expect(loadConfig({ ...localEnv, AUTH_CODE_PEPPER: localPepperPlaceholder }).authCodePepper).toBe(localPepperPlaceholder);
    expect(failureOf({ ...productionEnv, AUTH_CODE_PEPPER: localPepperPlaceholder }).variables).toEqual(["AUTH_CODE_PEPPER"]);
  });

  it("accepts a real-looking pepper in production", () => {
    expect(loadConfig(productionEnv).authCodePepper).toBe(pepper);
  });
});
