import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./load-config.js";

const databaseUrl = "postgresql://dbuser:s3cr3t-pass@db.internal:5432/seatholder";
const pepper = "unit-test-pepper-0123456789-abcdefghij";
const minimalEnv = { DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: pepper };
const productionEnv = { APP_ENV: "production", DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: pepper, FRONTEND_ORIGIN: "https://seats.example.com", COOKIE_SECURE: "true" };

function failureOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error("loadConfig did not throw");
}

describe("loadConfig email defaults and values", () => {
  it("defaults to the smtp provider on localhost:1025 with no credentials", () => {
    expect(loadConfig(minimalEnv)).toMatchObject({
      emailProvider: "smtp",
      emailFrom: "no-reply@seathold.local",
      smtpHost: "localhost",
      smtpPort: 1025,
    });
    expect(loadConfig(minimalEnv).smtpUser).toBeUndefined();
    expect(loadConfig(minimalEnv).smtpPass).toBeUndefined();
  });

  it("reads explicit email settings", () => {
    const config = loadConfig({
      ...minimalEnv,
      EMAIL_PROVIDER: "console",
      EMAIL_FROM: "tickets@example.com",
      SMTP_HOST: "mail.internal",
      SMTP_PORT: "587",
      SMTP_USER: "mailer",
      SMTP_PASS: "mail-pass-1",
    });

    expect(config).toMatchObject({
      emailProvider: "console",
      emailFrom: "tickets@example.com",
      smtpHost: "mail.internal",
      smtpPort: 587,
      smtpUser: "mailer",
      smtpPass: "mail-pass-1",
    });
  });

});

describe("loadConfig email validation", () => {
  it("fails for an unknown EMAIL_PROVIDER", () => {
    expect(failureOf({ ...minimalEnv, EMAIL_PROVIDER: "ses" }).variables).toEqual(["EMAIL_PROVIDER"]);
  });

  it.each(["0", "65536", "-1", "abc", "25.5", "25x"])("fails for SMTP_PORT=%s", (value) => {
    expect(failureOf({ ...minimalEnv, SMTP_PORT: value }).variables).toEqual(["SMTP_PORT"]);
  });

  it.each(["not-an-email", "a@b", "two@@host.test", "spaces in@host.test", "@host.test"])("fails for EMAIL_FROM=%s", (value) => {
    const error = failureOf({ ...minimalEnv, EMAIL_FROM: value });

    expect(error.variables).toEqual(["EMAIL_FROM"]);
    expect(error.message).not.toContain(value);
  });

  it("fails when SMTP_USER is set without SMTP_PASS, naming the variable and no value", () => {
    const error = failureOf({ ...minimalEnv, SMTP_USER: "mailer-user" });

    expect(error.variables).toEqual(["SMTP_PASS"]);
    expect(error.message).not.toContain("mailer-user");
  });

  it("fails when SMTP_PASS is set without SMTP_USER and never prints the password", () => {
    const error = failureOf({ ...minimalEnv, SMTP_PASS: "hunter2-secret" });

    expect(error.variables).toEqual(["SMTP_USER"]);
    expect(error.message).not.toContain("hunter2-secret");
  });

  it("refuses EMAIL_PROVIDER=console in production with the fixed rule text only", () => {
    const error = failureOf({ ...productionEnv, EMAIL_PROVIDER: "console" });

    expect(error.variables).toEqual(["EMAIL_PROVIDER"]);
    expect(error.message).toBe("Invalid configuration: EMAIL_PROVIDER must be smtp or console (console is refused in production)");
  });

  it("accepts smtp in production and console locally", () => {
    expect(loadConfig({ ...productionEnv, EMAIL_PROVIDER: "smtp" }).emailProvider).toBe("smtp");
    expect(loadConfig({ ...minimalEnv, EMAIL_PROVIDER: "console" }).emailProvider).toBe("console");
  });
});
