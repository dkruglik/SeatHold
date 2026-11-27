import { describe, expect, it } from "vitest";
import { cookieHeader, MS_PER_DAY, sha256Hex, sidOf, useAuthApp } from "./auth-route-test-support.js";

describe("POST /api/auth/verify", () => {
  const harness = useAuthApp();

  it("sets an HttpOnly, SameSite=Lax, Path=/api sid cookie living for the session lifetime and returns the user", async () => {
    const response = await harness.login("Ada@Example.io");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: expect.any(String), email: "Ada@Example.io", role: "buyer" } });
    const cookie = response.cookies.find((candidate) => candidate.name === "sid");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api", maxAge: 30 * MS_PER_DAY / 1000 });
    expect(cookie?.secure).toBeFalsy();
  });

  it("stores only the SHA-256 of the cookie value", async () => {
    const sid = sidOf(await harness.login("ada@example.io"));

    const rows = await harness.prisma.client.session.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(sid);
    expect(rows[0]?.tokenHash).toBe(sha256Hex(sid));
    expect(JSON.stringify(rows)).not.toContain(sid);
  });

  it("answers a wrong code with 400 INVALID_CODE and sets no cookie", async () => {
    const code = await harness.codeFor("ada@example.io");

    const response = await harness.post("/api/auth/verify", { email: "ada@example.io", code: code === "000000" ? "000001" : "000000" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "INVALID_CODE", message: expect.any(String) } });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await harness.prisma.client.session.count()).toBe(0);
  });

  it("never grants a role from the body: an extra role field changes nothing", async () => {
    const code = await harness.codeFor("mallory@example.io");

    const response = await harness.post("/api/auth/verify", { email: "mallory@example.io", code, role: "admin" });

    expect(response.json()).toMatchObject({ user: { role: "buyer" } });
    expect((await harness.prisma.client.user.findFirst({ where: { email: "mallory@example.io" } }))?.role).toBe("buyer");
  });

  it("rejects a body without a code", async () => {
    const response = await harness.post("/api/auth/verify", { email: "ada@example.io" });

    expect(response.statusCode).toBe(400);
  });

  it("rotates: every login gets a new sid, and a live sid presented at login is revoked", async () => {
    const first = sidOf(await harness.login("ada@example.io"));

    const second = sidOf(await harness.login("ada@example.io", cookieHeader(first)));

    expect(second).not.toBe("");
    expect(second).not.toBe(first);
    expect((await harness.get("/api/auth/me", cookieHeader(first))).json()).toEqual({ user: null });
    expect((await harness.get("/api/auth/me", cookieHeader(second))).json()).toMatchObject({ user: { email: "ada@example.io" } });
  });

  it("never reuses a sid the client chose", async () => {
    const response = await harness.login("ada@example.io", cookieHeader("attacker-chosen-sid"));

    expect(sidOf(response)).not.toBe("attacker-chosen-sid");
    expect(sidOf(response)).not.toBe("");
  });
});

describe("POST /api/auth/verify with COOKIE_SECURE", () => {
  const harness = useAuthApp({ cookieSecure: true });

  it("adds the Secure attribute", async () => {
    const response = await harness.login("ada@example.io");

    expect(response.cookies.find((cookie) => cookie.name === "sid")?.secure).toBe(true);
  });
});

describe("POST /api/auth/request-code", () => {
  const harness = useAuthApp();

  it("answers 204 with the same response for an existing and an unknown email", async () => {
    await harness.login("known@example.io");
    harness.clock.advance(61_000);

    const known = await harness.post("/api/auth/request-code", { email: "known@example.io" });
    const unknown = await harness.post("/api/auth/request-code", { email: "unknown@example.io" });

    expect(known.statusCode).toBe(204);
    expect(unknown.statusCode).toBe(204);
    expect(unknown.body).toBe(known.body);
    expect(unknown.headers["content-length"]).toBe(known.headers["content-length"]);
  });

  it("answers 429 with retryAfterSeconds and a Retry-After header inside the cooldown, the same for any email", async () => {
    await harness.post("/api/auth/request-code", { email: "known@example.io" });
    await harness.post("/api/auth/request-code", { email: "unknown@example.io" });

    for (const email of ["known@example.io", "unknown@example.io"]) {
      const response = await harness.post("/api/auth/request-code", { email });

      expect(response.statusCode).toBe(429);
      expect(response.json()).toEqual({ error: { code: "RATE_LIMITED", message: expect.any(String) }, retryAfterSeconds: 60 });
      expect(response.headers["retry-after"]).toBe("60");
    }
  });

  it("rejects a malformed email with 400", async () => {
    expect((await harness.post("/api/auth/request-code", { email: "not-an-email" })).statusCode).toBe(400);
    expect((await harness.post("/api/auth/request-code", {})).statusCode).toBe(400);
  });

  it("ignores a role field in the body", async () => {
    const response = await harness.post("/api/auth/request-code", { email: "ada@example.io", role: "admin" });

    expect(response.statusCode).toBe(204);
    expect(await harness.prisma.client.user.count()).toBe(0);
  });
});
