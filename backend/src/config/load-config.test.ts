import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./load-config.js";

const databaseUrl = "postgresql://dbuser:s3cr3t-pass@db.internal:5432/seatholder";
const pepper = "unit-test-pepper-0123456789-abcdefghij";
const minimalEnv = { DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: pepper, CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef" };
const productionEnv = { APP_ENV: "production", DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: pepper, CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef", FRONTEND_ORIGIN: "https://seats.example.com", COOKIE_SECURE: "true" };

const guestDefaults = { guestLinkTtlHours: 168, guestResendLimit: 3, guestResendWindowMinutes: 60 };

function failureOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error("loadConfig did not throw");
}

describe("loadConfig defaults", () => {
  it("applies the documented defaults when only DATABASE_URL is set", () => {
    expect(loadConfig(minimalEnv)).toEqual({
      appEnv: "local",
      backendHost: "0.0.0.0",
      backendPort: 3001,
      databaseUrl,
      databasePoolMax: 10,
      logLevel: "info",
      shutdownTimeoutMs: 10_000,
      frontendOrigin: "http://localhost:5173",
      emailProvider: "smtp",
      emailFrom: "no-reply@seathold.local",
      smtpHost: "localhost",
      smtpPort: 1025,
      authCodePepper: pepper,
      csrfSecret: "unit-test-csrf-secret-0123456789-abcdef",
      authRequestCodeLimit: 5,
      authRequestCodeWindowMinutes: 15,
      authRequestCodeCooldownSeconds: 60,
      cookieSecure: false,
      sessionTtlDays: 30,
      holdDurationMinutes: 10,
      maxSeatsPerHold: 10,
      defaultCurrency: "EUR",
      ...guestDefaults,
    });
  });

  it("converts and returns explicit values", () => {
    const config = loadConfig({
      ...minimalEnv,
      BACKEND_HOST: "127.0.0.1",
      BACKEND_PORT: "8080",
      LOG_LEVEL: "debug",
      SHUTDOWN_TIMEOUT_MS: "2500",
      FRONTEND_ORIGIN: "http://localhost:4000",
    });

    expect(config).toMatchObject({ backendHost: "127.0.0.1", backendPort: 8080, logLevel: "debug", shutdownTimeoutMs: 2500, frontendOrigin: "http://localhost:4000" });
  });

  it("reads DATABASE_POOL_MAX", () => {
    expect(loadConfig({ ...minimalEnv, DATABASE_POOL_MAX: "25" }).databasePoolMax).toBe(25);
    expect(loadConfig({ ...minimalEnv, DATABASE_POOL_MAX: "100" }).databasePoolMax).toBe(100);
  });

  it("returns a frozen config", () => {
    expect(Object.isFrozen(loadConfig(minimalEnv))).toBe(true);
  });

  it("treats an empty variable as unset", () => {
    expect(loadConfig({ ...minimalEnv, BACKEND_PORT: "" }).backendPort).toBe(3001);
  });
});

describe("loadConfig validation", () => {
  it("fails when DATABASE_URL is missing", () => {
    expect(failureOf({ AUTH_CODE_PEPPER: pepper, CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef" }).variables).toEqual(["DATABASE_URL"]);
  });

  it("fails when DATABASE_URL is not a postgresql URL", () => {
    expect(failureOf({ AUTH_CODE_PEPPER: pepper, CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef", DATABASE_URL: "mysql://u:p@h/db" }).variables).toEqual(["DATABASE_URL"]);
    expect(failureOf({ AUTH_CODE_PEPPER: pepper, CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef", DATABASE_URL: "not a url" }).variables).toEqual(["DATABASE_URL"]);
  });

  it.each(["0", "65536", "-1", "abc", "30.5", "3001x"])("fails for BACKEND_PORT=%s", (port) => {
    expect(failureOf({ ...minimalEnv, BACKEND_PORT: port }).variables).toEqual(["BACKEND_PORT"]);
  });

  it.each(["000", "101", "-1", "abc", "2.5", "10x"])("fails for DATABASE_POOL_MAX=%s, naming the variable and not the value", (value) => {
    const error = failureOf({ ...minimalEnv, DATABASE_POOL_MAX: value });

    expect(error.variables).toEqual(["DATABASE_POOL_MAX"]);
    expect(error.message).toContain("DATABASE_POOL_MAX");
    expect(error.message).not.toContain(value);
  });

  it("fails for an unknown APP_ENV", () => {
    expect(failureOf({ ...minimalEnv, APP_ENV: "staging" }).variables).toEqual(["APP_ENV"]);
  });

  it("fails for an unknown LOG_LEVEL", () => {
    expect(failureOf({ ...minimalEnv, LOG_LEVEL: "verbose" }).variables).toEqual(["LOG_LEVEL"]);
  });

  it.each(["0", "-5", "1.5", "soon"])("fails for SHUTDOWN_TIMEOUT_MS=%s", (value) => {
    expect(failureOf({ ...minimalEnv, SHUTDOWN_TIMEOUT_MS: value }).variables).toEqual(["SHUTDOWN_TIMEOUT_MS"]);
  });

  it.each(["localhost:5173", "ftp://example.com", "http://example.com/app", "http://example.com/?x=1", "https://u:p@example.com"])(
    "fails for FRONTEND_ORIGIN=%s",
    (origin) => {
      expect(failureOf({ ...minimalEnv, FRONTEND_ORIGIN: origin }).variables).toEqual(["FRONTEND_ORIGIN"]);
    },
  );

  it("lists every invalid variable by name in one error", () => {
    const error = failureOf({ AUTH_CODE_PEPPER: pepper, CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef", BACKEND_PORT: "0", APP_ENV: "nope", LOG_LEVEL: "loud" });

    expect(error.variables).toEqual(["APP_ENV", "BACKEND_PORT", "DATABASE_URL", "LOG_LEVEL"]);
    for (const name of error.variables) {
      expect(error.message).toContain(name);
    }
  });

  it("never prints a value in the error message", () => {
    const error = failureOf({ DATABASE_URL: "mysql://dbuser:s3cr3t-pass@db.internal/x", BACKEND_PORT: "99999", APP_ENV: "staging-secret" });

    for (const value of ["s3cr3t-pass", "dbuser", "db.internal", "99999", "staging-secret"]) {
      expect(error.message).not.toContain(value);
    }
  });
});

describe("loadConfig production rule", () => {
  it("accepts a complete production configuration", () => {
    expect(loadConfig(productionEnv)).toMatchObject({ appEnv: "production", frontendOrigin: "https://seats.example.com" });
  });

  it("requires FRONTEND_ORIGIN to be set explicitly in production", () => {
    expect(failureOf({ ...productionEnv, FRONTEND_ORIGIN: undefined }).variables).toEqual(["FRONTEND_ORIGIN"]);
  });

  it.each(["http://seats.example.com", "https://localhost", "https://127.0.0.1:5173", "http://localhost:5173"])(
    "refuses FRONTEND_ORIGIN=%s in production",
    (origin) => {
      const error = failureOf({ ...productionEnv, FRONTEND_ORIGIN: origin });

      expect(error.variables).toEqual(["FRONTEND_ORIGIN"]);
      expect(error.message).not.toContain(origin);
    },
  );

  it("refuses the IPv6 loopback origin in production", () => {
    expect(failureOf({ ...productionEnv, FRONTEND_ORIGIN: "https://[::1]" }).variables).toEqual(["FRONTEND_ORIGIN"]);
  });

  it("treats an empty FRONTEND_ORIGIN as unset and refuses it in production", () => {
    expect(failureOf({ ...productionEnv, FRONTEND_ORIGIN: "" }).variables).toEqual(["FRONTEND_ORIGIN"]);
  });

  it("reports FRONTEND_ORIGIN once when the production origin is also malformed", () => {
    const error = failureOf({ ...productionEnv, FRONTEND_ORIGIN: "https://seats.example.com/app" });

    expect(error.variables).toEqual(["FRONTEND_ORIGIN"]);
    expect(error.message.match(/FRONTEND_ORIGIN/g)).toHaveLength(1);
  });

  it("accepts a valid https origin with a port in production", () => {
    expect(loadConfig({ ...productionEnv, FRONTEND_ORIGIN: "https://seats.example.com:8443" }).frontendOrigin).toBe("https://seats.example.com:8443");
  });

  it("defaults APP_ENV to local when unset, which skips the production origin rule (DECISIONS.md O32)", () => {
    const config = loadConfig({ ...minimalEnv, FRONTEND_ORIGIN: "http://seats.example.com" });

    expect(config.appEnv).toBe("local");
    expect(config.frontendOrigin).toBe("http://seats.example.com");
  });

  it("allows the same local origin when APP_ENV is local", () => {
    expect(loadConfig({ ...minimalEnv, FRONTEND_ORIGIN: "http://localhost:5173" }).appEnv).toBe("local");
  });
});
