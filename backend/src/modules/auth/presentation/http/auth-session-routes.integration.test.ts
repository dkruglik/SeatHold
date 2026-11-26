import { describe, expect, it } from "vitest";
import { cookieHeader, MS_PER_DAY, sidOf, useAuthApp } from "./auth-route-test-support.js";

const unauthenticated = { error: { code: "UNAUTHENTICATED", message: expect.any(String) } };

describe("GET /api/auth/me", () => {
  const harness = useAuthApp();

  it("answers user null without a cookie, and for a cookie that matches no session", async () => {
    expect((await harness.get("/api/auth/me")).json()).toEqual({ user: null });
    expect((await harness.get("/api/auth/me", cookieHeader("garbage"))).json()).toEqual({ user: null });
  });

  it("answers the user of a live session", async () => {
    const sid = sidOf(await harness.login("ada@example.io"));

    const response = await harness.get("/api/auth/me", cookieHeader(sid));

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: expect.any(String), email: "ada@example.io", role: "buyer" } });
  });

  it("reads the role from the database on every request", async () => {
    const sid = sidOf(await harness.login("ada@example.io"));
    await harness.prisma.client.user.update({ where: { email: "ada@example.io" }, data: { role: "admin" } });

    expect((await harness.get("/api/auth/me", cookieHeader(sid))).json()).toMatchObject({ user: { role: "admin" } });
  });

  it("answers user null once the session lifetime has passed on the clock", async () => {
    const sid = sidOf(await harness.login("ada@example.io"));
    harness.clock.advance(30 * MS_PER_DAY);

    expect((await harness.get("/api/auth/me", cookieHeader(sid))).json()).toEqual({ user: null });
  });
});

describe("POST /api/auth/logout", () => {
  const harness = useAuthApp();

  it("answers 401 UNAUTHENTICATED without a session", async () => {
    const response = await harness.post("/api/auth/logout");

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthenticated);
  });

  it("revokes only the current session and clears the cookie", async () => {
    const first = sidOf(await harness.login("ada@example.io"));
    const second = sidOf(await harness.login("ada@example.io"));

    const response = await harness.post("/api/auth/logout", undefined, cookieHeader(first));

    expect(response.statusCode).toBe(204);
    const cleared = response.cookies.find((cookie) => cookie.name === "sid");
    expect(cleared).toMatchObject({ value: "", path: "/api", httpOnly: true, sameSite: "Lax" });
    expect((await harness.get("/api/auth/me", cookieHeader(first))).json()).toEqual({ user: null });
    expect((await harness.get("/api/auth/me", cookieHeader(second))).json()).toMatchObject({ user: { email: "ada@example.io" } });
  });

  it("answers 401 for a revoked session", async () => {
    const sid = sidOf(await harness.login("ada@example.io"));
    await harness.post("/api/auth/logout", undefined, cookieHeader(sid));

    const response = await harness.post("/api/auth/logout", undefined, cookieHeader(sid));

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthenticated);
  });

  it("answers 401 for an expired session", async () => {
    const sid = sidOf(await harness.login("ada@example.io"));
    harness.clock.advance(31 * MS_PER_DAY);

    const response = await harness.post("/api/auth/logout", undefined, cookieHeader(sid));

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthenticated);
  });
});

describe("POST /api/auth/logout-all", () => {
  const harness = useAuthApp();

  it("revokes every session of the user and none of another user", async () => {
    const first = sidOf(await harness.login("ada@example.io"));
    const second = sidOf(await harness.login("ada@example.io"));
    const other = sidOf(await harness.login("bob@example.io"));

    const response = await harness.post("/api/auth/logout-all", undefined, cookieHeader(first));

    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((cookie) => cookie.name === "sid")?.value).toBe("");
    expect((await harness.get("/api/auth/me", cookieHeader(first))).json()).toEqual({ user: null });
    expect((await harness.get("/api/auth/me", cookieHeader(second))).json()).toEqual({ user: null });
    expect((await harness.get("/api/auth/me", cookieHeader(other))).json()).toMatchObject({ user: { email: "bob@example.io" } });
  });

  it("answers 401 without a session", async () => {
    expect((await harness.post("/api/auth/logout-all")).statusCode).toBe(401);
  });
});
