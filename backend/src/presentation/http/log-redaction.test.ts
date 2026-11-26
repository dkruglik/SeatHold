import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import type { AppConfig } from "../../config/load-config.js";
import { createAuthServices } from "../../modules/auth/auth-composition.js";
import {
  InMemoryLoginCodeRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  RecordingEmailProvider,
} from "../../modules/auth/application/in-memory-auth-test-support.js";
import { ControlledClock } from "../../shared/time/controlled-clock.js";

interface LogRecord {
  level?: number;
  err?: { message?: string };
  req?: { url?: string; headers: Record<string, unknown> };
  res?: { statusCode?: number; headers?: Record<string, unknown> };
}

const config: AppConfig = {
  appEnv: "local",
  backendHost: "127.0.0.1",
  backendPort: 3001,
  databaseUrl: "postgresql://unused:unused@127.0.0.1:1/unused",
  databasePoolMax: 2,
  logLevel: "info",
  shutdownTimeoutMs: 1000,
  frontendOrigin: "http://localhost:5173",
  emailProvider: "console",
  emailFrom: "no-reply@seathold.local",
  smtpHost: "localhost",
  smtpPort: 1025,
  authCodePepper: "unit-test-pepper-0123456789-abcdefghij",
  authRequestCodeLimit: 5,
  authRequestCodeWindowMinutes: 15,
  authRequestCodeCooldownSeconds: 60,
  cookieSecure: false,
  sessionTtlDays: 30,
};

function capture(): { lines: string[]; stream: Writable; records: () => LogRecord[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const records = () => lines.flatMap((line) => line.split("\n")).filter((line) => line !== "").map((line) => JSON.parse(line) as LogRecord);
  return { lines, stream, records };
}

let app: FastifyInstance;

afterEach(() => app.close());

describe("query string and error logging", () => {
  it("logs the path only, so a token in the query string never reaches the log", async () => {
    const { lines, stream, records } = capture();
    app = buildApp(config, { clock: new ControlledClock(new Date()), logStream: stream });

    await app.inject({ method: "GET", url: "/api/health?token=SECRET_QUERY" });

    expect(lines.join("")).not.toContain("SECRET_QUERY");
    expect(records().some((record) => record.req?.url === "/api/health")).toBe(true);
  });

  it("logs one error record for a throwing route, with headers still redacted and no secret in the output", async () => {
    const { lines, stream, records } = capture();
    app = buildApp(config, { clock: new ControlledClock(new Date()), logStream: stream });
    app.get("/api/test-throw", () => {
      throw new Error("boom while handling");
    });

    await app.inject({ method: "GET", url: "/api/test-throw", headers: { cookie: "sid=SECRET_COOKIE_VALUE", authorization: "Bearer SECRET_AUTH_VALUE" } });

    const errors = records().filter((record) => record.level === 50);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.err?.message).toBe("boom while handling");
    expect(errors[0]?.req?.headers.cookie).toBe("[Redacted]");
    expect(errors[0]?.req?.headers.authorization).toBe("[Redacted]");
    expect(lines.join("")).not.toContain("SECRET_COOKIE_VALUE");
    expect(lines.join("")).not.toContain("SECRET_AUTH_VALUE");
  });

});

describe("request logging", () => {
  it("redacts cookie, CSRF token and Set-Cookie, and never logs the request body", async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    app = buildApp(config, { clock: new ControlledClock(new Date()), logStream });
    app.get("/api/test-cookie", (_request, reply) => reply.header("set-cookie", "sid=SECRET_SESSION_VALUE; HttpOnly").send({}));
    app.post("/api/test-body", (_request, reply) => reply.send({}));

    await app.inject({
      method: "GET",
      url: "/api/test-cookie",
      headers: { cookie: "sid=SECRET_COOKIE_VALUE", "x-csrf-token": "SECRET_CSRF_VALUE", authorization: "Bearer SECRET_AUTH_VALUE" },
    });
    await app.inject({ method: "POST", url: "/api/test-body", payload: { code: "SECRET_BODY_CODE" } });

    const output = lines.join("");
    const records = lines.flatMap((line) => line.split("\n")).filter((line) => line !== "").map((line) => JSON.parse(line) as LogRecord);
    const incoming = records.find((record) => record.req?.url === "/api/test-cookie");
    const completed = records.find((record) => record.res?.statusCode === 200 && record.res?.headers?.["set-cookie"] !== undefined);

    expect(incoming?.req?.headers.cookie).toBe("[Redacted]");
    expect(incoming?.req?.headers["x-csrf-token"]).toBe("[Redacted]");
    expect(incoming?.req?.headers.authorization).toBe("[Redacted]");
    expect(completed?.res?.headers?.["set-cookie"]).toBe("[Redacted]");
    for (const secret of ["SECRET_COOKIE_VALUE", "SECRET_CSRF_VALUE", "SECRET_AUTH_VALUE", "SECRET_SESSION_VALUE", "SECRET_BODY_CODE"]) {
      expect(output).not.toContain(secret);
    }
  });
});

describe("auth route logging", () => {
  it("never logs the login code, the sid, or the Set-Cookie value, and redacts the cookie header on later requests", async () => {
    const { lines, stream } = capture();
    const clock = new ControlledClock(new Date("2030-01-01T10:00:00.000Z"));
    const users = new InMemoryUserRepository();
    const email = new RecordingEmailProvider();
    const services = createAuthServices(config, { clock, email, users, codes: new InMemoryLoginCodeRepository(), sessions: new InMemorySessionRepository(users) });
    app = buildApp(config, { clock, logStream: stream, auth: { services } });

    await app.inject({ method: "POST", url: "/api/auth/request-code", payload: { email: "ada@example.io" } });
    const code = email.latestCode();
    const verified = await app.inject({ method: "POST", url: "/api/auth/verify", payload: { email: "ada@example.io", code } });
    const sid = verified.cookies.find((cookie) => cookie.name === "sid")?.value ?? "";
    await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: `sid=${sid}` } });

    const output = lines.join("");
    expect(sid).not.toBe("");
    expect(output).not.toContain(sid);
    expect(output).not.toContain(`"${code}"`);
    expect(output).toContain("[Redacted]");
  });
});
