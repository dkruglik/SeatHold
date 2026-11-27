import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../../../config/load-config.js";
import { browserStateChangeHooks } from "./browser-state-change-hooks.js";
import { registerCsrfProtection } from "../csrf-protection.js";
import { registerErrorHandler } from "./error-handler.js";

const settings: Pick<AppConfig, "csrfSecret" | "cookieSecure" | "frontendOrigin"> = {
  csrfSecret: "hook-test-csrf-secret-0123456789-abcdefgh",
  cookieSecure: false,
  frontendOrigin: "http://localhost:5173",
};
const ORIGIN = settings.frontendOrigin;

async function buildHookApp(config = settings): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  registerCsrfProtection(app, config);
  app.get("/token", (_request, reply) => ({ token: reply.generateCsrf() }));
  app.post("/mutate", { onRequest: [...browserStateChangeHooks(config)] }, () => ({ ok: true }));
  app.put("/mutate", { onRequest: [...browserStateChangeHooks(config)] }, () => ({ ok: true }));
  app.patch("/mutate", { onRequest: [...browserStateChangeHooks(config)] }, () => ({ ok: true }));
  app.delete("/mutate", { onRequest: [...browserStateChangeHooks(config)] }, () => ({ ok: true }));
  await app.ready();
  return app;
}

/** The token and the cookie header a browser would send back after GET /token. */
async function issue(app: FastifyInstance): Promise<{ token: string; cookie: string }> {
  const response = await app.inject({ method: "GET", url: "/token" });
  const set = response.cookies[0];
  return { token: (response.json() as { token: string }).token, cookie: `${set?.name}=${set?.value}` };
}

const invalidCsrf = { error: { code: "CSRF_INVALID", message: expect.any(String) } };
const invalidOrigin = { error: { code: "ORIGIN_INVALID", message: expect.any(String) } };

describe("browserStateChangeHooks", () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  it("lets a request with the matching Origin, the token and its cookie through", async () => {
    app = await buildHookApp();
    const { token, cookie } = await issue(app);

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { origin: ORIGIN, cookie, "x-csrf-token": token } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)("rejects a %s without a token with 403 CSRF_INVALID", async (method) => {
    app = await buildHookApp();
    const { cookie } = await issue(app);

    const response = await app.inject({ method, url: "/mutate", headers: { origin: ORIGIN, cookie } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidCsrf);
  });

});

describe("browserStateChangeHooks token check", () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  it("rejects a token sent without its cookie", async () => {
    app = await buildHookApp();
    const { token } = await issue(app);

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { origin: ORIGIN, "x-csrf-token": token } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidCsrf);
  });

  it("rejects a wrong token", async () => {
    app = await buildHookApp();
    const { cookie } = await issue(app);

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { origin: ORIGIN, cookie, "x-csrf-token": "not-a-valid-token" } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidCsrf);
  });

  it("rejects a token that belongs to another secret", async () => {
    app = await buildHookApp();
    const { token } = await issue(app);
    const other = await buildHookApp();
    const foreign = await issue(other);
    await other.close();

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { origin: ORIGIN, cookie: foreign.cookie, "x-csrf-token": token } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidCsrf);
  });

  it("rejects a cookie signed with another cookie secret even with its own token", async () => {
    app = await buildHookApp();
    const other = await buildHookApp({ ...settings, csrfSecret: "another-csrf-secret-0123456789-abcdefghijk" });
    const foreign = await issue(other);
    await other.close();

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { origin: ORIGIN, cookie: foreign.cookie, "x-csrf-token": foreign.token } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidCsrf);
  });

  it("reads the token from the X-CSRF-Token header only, not from the body or other headers", async () => {
    app = await buildHookApp();
    const { token, cookie } = await issue(app);

    const inBody = await app.inject({ method: "POST", url: "/mutate", headers: { origin: ORIGIN, cookie }, payload: { _csrf: token } });
    const inOtherHeader = await app.inject({ method: "POST", url: "/mutate", headers: { origin: ORIGIN, cookie, "csrf-token": token } });

    expect(inBody.statusCode).toBe(403);
    expect(inOtherHeader.statusCode).toBe(403);
  });

});

describe("browserStateChangeHooks Origin check", () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  it("rejects a different Origin with 403 ORIGIN_INVALID before checking the token", async () => {
    app = await buildHookApp();
    const { token, cookie } = await issue(app);

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { origin: "http://evil.example", cookie, "x-csrf-token": token } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidOrigin);
  });

  it.each(["http://localhost:5173/", "http://localhost:5174", "https://localhost:5173", "HTTP://LOCALHOST:5173", "null", ""])(
    "requires the Origin to equal the frontend origin exactly: %j is refused",
    async (origin) => {
      app = await buildHookApp();
      const { token, cookie } = await issue(app);

      const response = await app.inject({ method: "POST", url: "/mutate", headers: { origin, cookie, "x-csrf-token": token } });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual(invalidOrigin);
    },
  );

  it("rejects a mutation without an Origin header, even with a valid token", async () => {
    app = await buildHookApp();
    const { token, cookie } = await issue(app);

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { cookie, "x-csrf-token": token } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidOrigin);
  });

  it("does not fall back to Referer when Origin is missing", async () => {
    app = await buildHookApp();
    const { token, cookie } = await issue(app);

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { cookie, "x-csrf-token": token, referer: `${ORIGIN}/page` } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(invalidOrigin);
  });

  it("never echoes the token or the secret in the error body", async () => {
    app = await buildHookApp();
    const { token, cookie } = await issue(app);

    const response = await app.inject({ method: "POST", url: "/mutate", headers: { origin: ORIGIN, cookie, "x-csrf-token": `${token}x` } });

    expect(response.body).not.toContain(token);
    expect(response.body).not.toContain(settings.csrfSecret);
  });
});
