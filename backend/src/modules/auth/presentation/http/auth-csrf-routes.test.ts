import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { testConfig } from "./auth-route-test-support.js";
import { buildMemoryAuthApp, fetchCsrf } from "./auth-memory-app-test-support.js";

const ORIGIN = "http://localhost:5173";
const invalidCsrf = { error: { code: "CSRF_INVALID", message: expect.any(String) } };
const invalidOrigin = { error: { code: "ORIGIN_INVALID", message: expect.any(String) } };

let app: FastifyInstance;
let email: ReturnType<typeof buildMemoryAuthApp>["email"];

function start(overrides: Parameters<typeof testConfig>[0] = {}): void {
  ({ app, email } = buildMemoryAuthApp(testConfig(overrides)));
}

afterEach(() => app.close());

describe("GET /api/auth/csrf", () => {
  it("returns a token and sets the signed secret cookie, apart from the session cookie", async () => {
    start();

    const response = await app.inject({ method: "GET", url: "/api/auth/csrf" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ csrfToken: expect.stringMatching(/.{20,}/) });
    const cookie = response.cookies.find((candidate) => candidate.name === "csrf_secret");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api" });
    expect(cookie?.secure).toBeUndefined();
    expect(response.cookies.some((candidate) => candidate.name === "sid")).toBe(false);
    expect(response.body).not.toContain(cookie?.value ?? "unreachable");
  });

  it("marks the cookie Secure when COOKIE_SECURE is on", async () => {
    start({ cookieSecure: true });

    const response = await app.inject({ method: "GET", url: "/api/auth/csrf" });

    expect(response.cookies.find((candidate) => candidate.name === "csrf_secret")?.secure).toBe(true);
  });

  it("is never cached", async () => {
    start();

    const response = await app.inject({ method: "GET", url: "/api/auth/csrf" });

    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("needs neither a token nor an Origin, and ignores a foreign Origin", async () => {
    start();

    const response = await app.inject({ method: "GET", url: "/api/auth/csrf", headers: { origin: "http://evil.example" } });

    expect(response.statusCode).toBe(200);
  });

  it("keeps the secret of the browser's cookie, so an earlier token stays valid", async () => {
    start();
    const first = await fetchCsrf(app);

    const again = await app.inject({ method: "GET", url: "/api/auth/csrf", headers: { cookie: first.cookie } });
    const second = (again.json() as { csrfToken: string }).csrfToken;

    expect(again.cookies.some((candidate) => candidate.name === "csrf_secret")).toBe(false);
    for (const [index, token] of [first.token, second].entries()) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/request-code",
        headers: { origin: ORIGIN, cookie: first.cookie, "x-csrf-token": token },
        payload: { email: `user${index}@example.io` },
      });
      expect(response.statusCode).toBe(204);
    }
  });
});

describe("state-changing auth routes", () => {
  it("answers 403 CSRF_INVALID to request-code without a token", async () => {
    start();
    const { cookie } = await fetchCsrf(app);

    const response = await app.inject({ method: "POST", url: "/api/auth/request-code", headers: { origin: ORIGIN, cookie }, payload: { email: "ada@example.io" } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidCsrf);
    expect(email.sent).toHaveLength(0);
  });

  it("answers 403 CSRF_INVALID to a wrong token", async () => {
    start();
    const { cookie } = await fetchCsrf(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      headers: { origin: ORIGIN, cookie, "x-csrf-token": "wrong" },
      payload: { email: "ada@example.io" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidCsrf);
  });

  it("answers 403 CSRF_INVALID to a token and cookie issued under another CSRF_SECRET", async () => {
    start();
    const foreign = buildMemoryAuthApp(testConfig({ csrfSecret: "another-csrf-secret-0123456789-abcdefghijk" }));
    const issued = await fetchCsrf(foreign.app);
    await foreign.app.close();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      headers: { origin: ORIGIN, cookie: issued.cookie, "x-csrf-token": issued.token },
      payload: { email: "ada@example.io" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidCsrf);
  });

});

describe("state-changing auth routes, Origin and signed-in use", () => {
  it("answers 403 ORIGIN_INVALID for a wrong Origin and for a missing one, with a valid token", async () => {
    start();
    const { token, cookie } = await fetchCsrf(app);
    const send = (headers: Record<string, string>) =>
      app.inject({ method: "POST", url: "/api/auth/request-code", headers: { cookie, "x-csrf-token": token, ...headers }, payload: { email: "ada@example.io" } });

    for (const response of [await send({ origin: "http://evil.example" }), await send({})]) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(invalidOrigin);
    }
    expect(email.sent).toHaveLength(0);
  });

  it("runs the route normally with a valid token, its cookie and the Origin", async () => {
    start();
    const { token, cookie } = await fetchCsrf(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/request-code",
      headers: { origin: ORIGIN, cookie, "x-csrf-token": token },
      payload: { email: "ada@example.io" },
    });

    expect(response.statusCode).toBe(204);
    expect(email.sent).toHaveLength(1);
  });

  it("checks CSRF before authentication, and lets a signed-in logout through with valid credentials", async () => {
    start();
    const { token, cookie } = await fetchCsrf(app);
    const headers = { origin: ORIGIN, cookie, "x-csrf-token": token };
    await app.inject({ method: "POST", url: "/api/auth/request-code", headers, payload: { email: "ada@example.io" } });
    const code = email.latestCode();
    const verified = await app.inject({ method: "POST", url: "/api/auth/verify", headers, payload: { email: "ada@example.io", code } });
    const sid = verified.cookies.find((candidate) => candidate.name === "sid")?.value ?? "";
    const withSid = { ...headers, cookie: `${cookie}; sid=${sid}` };

    const withoutToken = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin: ORIGIN, cookie: withSid.cookie } });
    const loggedOut = await app.inject({ method: "POST", url: "/api/auth/logout", headers: withSid });

    expect(verified.statusCode).toBe(200);
    expect(withoutToken.statusCode).toBe(403);
    expect(withoutToken.json()).toEqual(invalidCsrf);
    expect(loggedOut.statusCode).toBe(204);
  });
});

describe("read-only routes", () => {
  it.each(["/api/auth/me", "/api/auth/csrf", "/api/health"])("GET %s is never subject to the CSRF or Origin check", async (url) => {
    start();

    for (const headers of [{}, { origin: "http://evil.example" }]) {
      expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(200);
    }
  });
});
