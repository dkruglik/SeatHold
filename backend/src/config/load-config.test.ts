import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./load-config.js";

const databaseUrl = "postgresql://dbuser:s3cr3t-pass@db.internal:5432/seatholder";
const minimalEnv = { DATABASE_URL: databaseUrl };
const productionEnv = { APP_ENV: "production", DATABASE_URL: databaseUrl, FRONTEND_ORIGIN: "https://seats.example.com" };

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
      logLevel: "info",
      shutdownTimeoutMs: 10_000,
      frontendOrigin: "http://localhost:5173",
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

  it("returns a frozen config", () => {
    expect(Object.isFrozen(loadConfig(minimalEnv))).toBe(true);
  });

  it("treats an empty variable as unset", () => {
    expect(loadConfig({ ...minimalEnv, BACKEND_PORT: "" }).backendPort).toBe(3001);
  });
});

describe("loadConfig validation", () => {
  it("fails when DATABASE_URL is missing", () => {
    expect(failureOf({}).variables).toEqual(["DATABASE_URL"]);
  });

  it("fails when DATABASE_URL is not a postgresql URL", () => {
    expect(failureOf({ DATABASE_URL: "mysql://u:p@h/db" }).variables).toEqual(["DATABASE_URL"]);
    expect(failureOf({ DATABASE_URL: "not a url" }).variables).toEqual(["DATABASE_URL"]);
  });

  it.each(["0", "65536", "-1", "abc", "30.5", "3001x"])("fails for BACKEND_PORT=%s", (port) => {
    expect(failureOf({ ...minimalEnv, BACKEND_PORT: port }).variables).toEqual(["BACKEND_PORT"]);
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
    const error = failureOf({ BACKEND_PORT: "0", APP_ENV: "nope", LOG_LEVEL: "loud" });

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

  it("allows the same local origin when APP_ENV is local", () => {
    expect(loadConfig({ ...minimalEnv, FRONTEND_ORIGIN: "http://localhost:5173" }).appEnv).toBe("local");
  });
});
