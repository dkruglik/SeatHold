import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildMemoryAuthApp } from "../../modules/auth/presentation/http/auth-memory-app-test-support.js";
import { testConfig } from "../../modules/auth/presentation/http/auth-route-test-support.js";
import { createAuthHooks } from "../../modules/auth/index.js";
import { User } from "../../modules/auth/domain/user.js";
import type { SessionService } from "../../modules/auth/application/session-service.js";
import { adminPlugin } from "./admin-plugin.js";
import { registerErrorHandler } from "./hooks/error-handler.js";

let app: FastifyInstance;
afterEach(() => app.close());

const admin = new User("a1", "root@example.io", "admin", new Date());
const buyer = new User("b1", "ada@example.io", "buyer", new Date());

/** A session service whose token names the user: "admin", "buyer" or unknown. */
const sessions = {
  authenticate: (token: string) =>
    Promise.resolve(token === "admin" ? { id: "s-a", user: admin } : token === "buyer" ? { id: "s-b", user: buyer } : null),
} as unknown as SessionService;

async function build(routes: readonly FastifyPluginAsync[], calls: string[] = []): Promise<FastifyInstance> {
  app = Fastify();
  registerErrorHandler(app);
  void app.register(cookie);
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);
  void app.register(adminPlugin, {
    prefix: "/api/admin",
    auth: createAuthHooks(sessions),
    mutationHooks: [
      async (request) => {
        calls.push(`mutation ${request.method}`);
        if (request.headers["x-ok"] !== "1") throw new Error("mutation hook refused");
      },
    ],
    routes,
  });
  await app.ready();
  return app;
}

const get = (sid?: string) => app.inject({ method: "GET", url: "/api/admin/thing", ...(sid === undefined ? {} : { headers: { cookie: `sid=${sid}` } }) });

describe("adminPlugin", () => {
  const thing: FastifyPluginAsync = async (scope) => {
    scope.get("/thing", () => ({ ok: true }));
    scope.post("/thing", () => ({ posted: true }));
  };

  it("guards every route that a later module adds through the extension list", async () => {
    await build([thing]);

    expect((await get()).statusCode).toBe(401);
    expect((await get("buyer")).json()).toEqual({ error: { code: "FORBIDDEN_ROLE", message: expect.any(String) } });
    expect((await get("admin")).json()).toEqual({ ok: true });
  });

  it("runs the browser-state-change hooks for a mutating route first, and not for a GET", async () => {
    const calls: string[] = [];
    await build([thing], calls);

    await get("admin");
    expect(calls).toEqual([]);

    const refused = await app.inject({ method: "POST", url: "/api/admin/thing", headers: { cookie: "sid=admin" } });
    expect(refused.statusCode).toBe(500);
    const allowed = await app.inject({ method: "POST", url: "/api/admin/thing", headers: { cookie: "sid=admin", "x-ok": "1" } });
    expect(allowed.json()).toEqual({ posted: true });
    expect(calls).toEqual(["mutation POST", "mutation POST"]);
  });
});

describe("the real app", () => {
  it("registers GET /api/admin/ping behind the guard (anonymous gets 401; the admin 200 is in admin-access.integration.test.ts)", async () => {
    ({ app } = buildMemoryAuthApp(testConfig()));
    const response = await app.inject({ method: "GET", url: "/api/admin/ping" });

    expect(response.statusCode).toBe(401);
  });
});
