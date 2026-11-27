import { describe, expect, it } from "vitest";
import { InfrastructureError } from "../../../../shared/errors/app-error.js";
import type { EmailProvider } from "../../application/ports/email-provider.js";
import { useAuthApp } from "./auth-route-test-support.js";

const wrongCodeFor = (code: string): string => (code === "000000" ? "000001" : "000000");
const MINUTE_MS = 60_000;

describe("POST /api/auth/request-code window limit", () => {
  const harness = useAuthApp();

  it("answers 429 with the wait for the window, not the cooldown, on the 6th request in 15 minutes", async () => {
    for (let count = 0; count < 5; count += 1) {
      harness.clock.advance(61_000);
      expect((await harness.post("/api/auth/request-code", { email: "ada@example.io" })).statusCode).toBe(204);
    }
    harness.clock.advance(61_000);

    const response = await harness.post("/api/auth/request-code", { email: "ada@example.io" });

    // The first request was 5 * 61s ago; it leaves the 15-minute window 900s after it was made.
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: { code: "RATE_LIMITED", message: expect.any(String) }, retryAfterSeconds: 900 - 5 * 61 });
    expect(response.headers["retry-after"]).toBe(String(900 - 5 * 61));
  });
});

describe("POST /api/auth/verify with an unusable code", () => {
  const harness = useAuthApp();

  it("answers 400 INVALID_CODE with no cookie once the code has expired", async () => {
    const code = await harness.codeFor("ada@example.io");
    harness.clock.advance(10 * MINUTE_MS + 1000);

    const response = await harness.post("/api/auth/verify", { email: "ada@example.io", code });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "INVALID_CODE", message: expect.any(String) } });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("answers 400 INVALID_CODE with no cookie for the right code after 5 wrong attempts", async () => {
    const code = await harness.codeFor("ada@example.io");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await harness.post("/api/auth/verify", { email: "ada@example.io", code: wrongCodeFor(code) });
    }

    const response = await harness.post("/api/auth/verify", { email: "ada@example.io", code });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "INVALID_CODE", message: expect.any(String) } });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await harness.prisma.client.session.count()).toBe(0);
  });
});

describe("POST /api/auth/request-code when the email provider fails", () => {
  const providerMessage = "smtp secret-host rejected login 424242";
  const sent: string[] = [];
  const failing: EmailProvider = {
    send: (message) => {
      sent.push(message.text);
      return Promise.reject(new InfrastructureError(providerMessage));
    },
  };
  const harness = useAuthApp({}, undefined, failing);

  it("answers 500 with the generic body, leaking neither the code nor the provider message", async () => {
    const response = await harness.post("/api/auth/request-code", { email: "ada@example.io" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: "internal_error", message: "Internal server error" } });
    expect(response.body).not.toContain("secret-host");
    expect(response.body).not.toContain(providerMessage);
    const code = /\b(\d{6})\b/.exec(sent.at(-1) ?? "")?.[1];
    expect(code).toBeDefined();
    expect(response.body).not.toContain(code ?? "no-code");
  });
});
