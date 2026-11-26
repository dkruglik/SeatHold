import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config/load-config.js";
import { ControlledClock } from "./shared/time/controlled-clock.js";

const config: AppConfig = {
  appEnv: "local",
  backendHost: "127.0.0.1",
  backendPort: 3001,
  databaseUrl: "postgresql://unused:unused@127.0.0.1:1/unused",
  databasePoolMax: 2,
  logLevel: "silent",
  shutdownTimeoutMs: 1000,
  frontendOrigin: "http://localhost:5173",
  emailProvider: "console",
  emailFrom: "no-reply@seathold.local",
  smtpHost: "localhost",
  smtpPort: 1025,
  authCodePepper: "unit-test-pepper-0123456789-abcdefghij",
  csrfSecret: "unit-test-csrf-secret-0123456789-abcdef",
  authRequestCodeLimit: 5,
  authRequestCodeWindowMinutes: 15,
  authRequestCodeCooldownSeconds: 60,
  cookieSecure: false,
  sessionTtlDays: 30,
  holdDurationMinutes: 10,
  maxSeatsPerHold: 10,
  defaultCurrency: "EUR",
};

describe("GET /api/health", () => {
  let app: FastifyInstance;

  afterEach(() => app.close());

  it("answers 200 with status ok and needs no database", async () => {
    app = buildApp(config, { clock: new ControlledClock(new Date()) });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("is served under /api only", async () => {
    app = buildApp(config, { clock: new ControlledClock(new Date()) });

    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(404);
  });

  it("refuses cross-origin browser calls by sending no CORS headers", async () => {
    app = buildApp(config, { clock: new ControlledClock(new Date()) });

    const response = await app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://evil.example" } });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
