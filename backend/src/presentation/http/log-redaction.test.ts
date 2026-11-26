import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../app.js";
import type { AppConfig } from "../../config/load-config.js";
import { ControlledClock } from "../../shared/time/controlled-clock.js";

interface LogRecord {
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
};

describe("request logging", () => {
  let app: FastifyInstance;

  afterEach(() => app.close());

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
