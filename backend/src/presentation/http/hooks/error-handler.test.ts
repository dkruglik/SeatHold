import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../app.js";
import type { AppConfig } from "../../../config/load-config.js";
import {
  AuthenticationError,
  AuthorizationError,
  BusinessError,
  InfrastructureError,
  NotFoundError,
  PaymentRequiredError,
  ValidationError,
} from "../../../shared/errors/app-error.js";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";

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
  csrfSecret: "unit-test-csrf-secret-0123456789-abcdef",
  authRequestCodeLimit: 5,
  authRequestCodeWindowMinutes: 15,
  authRequestCodeCooldownSeconds: 60,
  cookieSecure: false,
  sessionTtlDays: 30,
  holdDurationMinutes: 10,
  maxSeatsPerHold: 10,
  defaultCurrency: "EUR",
  guestLinkTtlHours: 168,
  guestResendLimit: 3,
  guestResendWindowMinutes: 60,
};

interface LogRecord {
  level?: number;
  err?: { message?: string; stack?: string };
}

function build(): { app: FastifyInstance; records: () => LogRecord[] } {
  const lines: string[] = [];
  const logStream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const app = buildApp(config, { clock: new ControlledClock(new Date()), logStream });
  const records = () => lines.flatMap((line) => line.split("\n")).filter((line) => line !== "").map((line) => JSON.parse(line) as LogRecord);
  return { app, records };
}

let app: FastifyInstance;

afterEach(() => app.close());

describe("HTTP error contract for application errors", () => {
  it.each([
    ["validation", new ValidationError("Name is required"), 400, "validation_error"],
    ["authentication", new AuthenticationError("Sign in first"), 401, "authentication_required"],
    ["authorization", new AuthorizationError("Not allowed"), 403, "forbidden"],
    ["business", new BusinessError("Seat is already held"), 409, "business_rule_violation"],
    ["not_found", new NotFoundError("No such thing"), 404, "not_found"],
    ["payment_required", new PaymentRequiredError("Pay first"), 402, "payment_required"],
    ["not_found with a public code", new NotFoundError("No hold", { publicCode: "HOLD_NOT_FOUND" }), 404, "HOLD_NOT_FOUND"],
  ])("maps a %s error to its status and the { error: { code, message } } body", async (_kind, error, status, code) => {
    const built = build();
    app = built.app;
    app.get("/api/test-error", () => {
      throw error;
    });

    const response = await app.inject({ method: "GET", url: "/api/test-error" });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error: { code, message: error.message } });
  });

  it("answers an infrastructure error with a generic 500 and logs the original once", async () => {
    const built = build();
    app = built.app;
    app.get("/api/test-error", () => {
      throw new InfrastructureError("clock query failed for db password hunter2");
    });

    const response = await app.inject({ method: "GET", url: "/api/test-error" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: "internal_error", message: "Internal server error" } });
    expect(response.body).not.toContain("hunter2");
    expect(built.records().filter((record) => record.level === 50)).toHaveLength(1);
  });

  it("answers an unknown error with a generic 500 body and logs the message and stack once", async () => {
    const built = build();
    app = built.app;
    app.get("/api/test-error", () => {
      throw new Error("db password leaked");
    });

    const response = await app.inject({ method: "GET", url: "/api/test-error" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: "internal_error", message: "Internal server error" } });
    expect(response.body).not.toContain("db password leaked");
    expect(response.body).not.toContain("at ");
    const errors = built.records().filter((record) => record.level === 50);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.err?.message).toBe("db password leaked");
    expect(errors[0]?.err?.stack).toContain("Error: db password leaked");
  });

});

describe("HTTP error contract for public codes", () => {
  it("sends the public code an application error carries instead of the generic one", async () => {
    const built = build();
    app = built.app;
    app.get("/api/test-error", () => {
      throw new AuthenticationError("Authentication required", { publicCode: "UNAUTHENTICATED" });
    });

    const response = await app.inject({ method: "GET", url: "/api/test-error" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
  });
});

describe("HTTP error contract for unexpected errors and bad requests", () => {
  it("answers a malformed JSON body with 400 and the same shape, without echoing the body", async () => {
    const built = build();
    app = built.app;
    app.post("/api/test-body", () => ({ ok: true }));

    const response = await app.inject({
      method: "POST",
      url: "/api/test-body",
      headers: { "content-type": "application/json" },
      payload: '{"code": SECRET_BODY_CODE',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "invalid_request", message: "Invalid request" } });
    expect(response.body).not.toContain("SECRET_BODY_CODE");
  });

});

describe("HTTP error contract for schema and size limits", () => {
  it("answers a schema validation failure with 400 and the same shape", async () => {
    const built = build();
    app = built.app;
    app.post("/api/test-schema", { schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } }, () => ({ ok: true }));

    const response = await app.inject({ method: "POST", url: "/api/test-schema", payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "invalid_request", message: "Invalid request" } });
  });

  it("answers a payload over the body limit with 413 and the same shape", async () => {
    const built = build();
    app = built.app;
    app.post("/api/test-body", () => ({ ok: true }));

    const response = await app.inject({
      method: "POST",
      url: "/api/test-body",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ filler: "x".repeat(1_100_000) }),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: { code: "payload_too_large", message: "Payload too large" } });
  });
});
