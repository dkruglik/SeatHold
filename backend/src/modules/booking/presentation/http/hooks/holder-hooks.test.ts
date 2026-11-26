import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createHolderHooks } from "./holder-hooks.js";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_SECONDS, hashVisitorToken } from "./visitor-token.js";

let app: FastifyInstance;

afterEach(() => app.close());

/** A tiny app: a fake optionalAuth sets `request.user` from the `x-user` header, then the holder hook under test runs. */
async function build(route: "resolve" | "issue", secure = false): Promise<FastifyInstance> {
  const hooks = createHolderHooks({ secure });
  app = Fastify();
  await app.register(cookie);
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);
  app.decorateRequest("holder", null);
  const fakeAuth = async (request: { user: unknown; headers: Record<string, unknown> }): Promise<void> => {
    const id = request.headers["x-user"];
    request.user = typeof id === "string" ? { id } : null;
  };
  app.get("/holder", { onRequest: [fakeAuth as never, route === "issue" ? hooks.issueHolder : hooks.resolveHolder] }, (request) => ({ holder: request.holder }));
  await app.ready();
  return app;
}

const token = "A".repeat(43);

describe("holder hooks", () => {
  it("issues a vid cookie to a fresh visitor and resolves the holder from its hash", async () => {
    await build("issue", true);

    const response = await app.inject({ method: "GET", url: "/holder" });

    const set = response.cookies.find((c) => c.name === VISITOR_COOKIE);
    expect(set).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api", secure: true, maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS });
    expect(set?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.json()).toEqual({ holder: { kind: "visitor", visitorHash: hashVisitorToken(set?.value ?? "") } });
    expect(response.body).not.toContain(set?.value);
  });

  it("reuses a valid cookie and does not issue it again", async () => {
    await build("issue");

    const response = await app.inject({ method: "GET", url: "/holder", headers: { cookie: `${VISITOR_COOKIE}=${token}` } });

    expect(response.cookies).toEqual([]);
    expect(response.json()).toEqual({ holder: { kind: "visitor", visitorHash: hashVisitorToken(token) } });
  });

  it.each(["short", `${"A".repeat(42)}!`, "A".repeat(44), ""])("treats the malformed cookie %j as absent and issues a new one", async (bad) => {
    await build("issue");

    const response = await app.inject({ method: "GET", url: "/holder", headers: { cookie: `${VISITOR_COOKIE}=${bad}` } });

    const fresh = response.cookies.find((c) => c.name === VISITOR_COOKIE)?.value;
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fresh).not.toBe(bad);
  });

  it("lets a signed-in user win over the visitor cookie and issues nothing", async () => {
    await build("issue");

    const response = await app.inject({ method: "GET", url: "/holder", headers: { "x-user": "user-1", cookie: `${VISITOR_COOKIE}=${token}` } });

    expect(response.json()).toEqual({ holder: { kind: "user", userId: "user-1" } });
    expect(response.cookies).toEqual([]);
  });

  it("read-only hook: no identity means no holder and no cookie", async () => {
    await build("resolve");

    const response = await app.inject({ method: "GET", url: "/holder" });

    expect(response.json()).toEqual({ holder: null });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("read-only hook: resolves a valid cookie, ignores a malformed one, and prefers the user", async () => {
    await build("resolve");

    const valid = await app.inject({ method: "GET", url: "/holder", headers: { cookie: `${VISITOR_COOKIE}=${token}` } });
    const malformed = await app.inject({ method: "GET", url: "/holder", headers: { cookie: `${VISITOR_COOKIE}=nope` } });
    const user = await app.inject({ method: "GET", url: "/holder", headers: { "x-user": "u", cookie: `${VISITOR_COOKIE}=${token}` } });

    expect(valid.json()).toEqual({ holder: { kind: "visitor", visitorHash: hashVisitorToken(token) } });
    expect(malformed.json()).toEqual({ holder: null });
    expect(user.json()).toEqual({ holder: { kind: "user", userId: "u" } });
  });
});
