import { describe, expect, it } from "vitest";
import { tokenFromEmail, useGuestApp } from "./guest-route-test-support.js";

const harness = useGuestApp();

describe("POST /api/guest/resend", () => {
  it("answers byte-identical 204s for a known and an unknown email, and emails only the known one", async () => {
    const { email } = await harness.bookingWithLink();
    harness.emails.sent.length = 0;

    const known = await harness.post("/api/guest/resend", { email });
    const sentForKnown = harness.emails.sent.length;
    const unknown = await harness.post("/api/guest/resend", { email: "nobody@example.com" });

    expect(known.statusCode).toBe(204);
    expect(unknown.statusCode).toBe(204);
    expect(known.body).toBe("");
    expect(unknown.body).toBe("");
    expect(sentForKnown).toBe(1);
    expect(harness.emails.sent).toHaveLength(1);
    const comparable = (h: Record<string, unknown>) => ({ ...h, date: undefined });
    expect(comparable(unknown.headers)).toEqual(comparable(known.headers));
  });

  it("emails a new link, makes the old link 410 and revokes the existing guest session", async () => {
    const { email, token, bookingId } = await harness.bookingWithLink();
    const cookie = await harness.sessionFor(token);
    await harness.guest().issue.issue({ bookingId, email, eventStartsAt: new Date("2026-02-01T12:00:00Z"), eventTitle: "Show" });
    const olderUnused = tokenFromEmail(harness.emails);
    harness.emails.sent.length = 0;

    const response = await harness.post("/api/guest/resend", { email });

    expect(response.statusCode).toBe(204);
    expect(harness.emails.sent).toHaveLength(1);
    const fresh = tokenFromEmail(harness.emails);
    expect(fresh).not.toBe(olderUnused);
    expect((await harness.get("/api/guest/booking", { cookie })).statusCode).toBe(401);
    expect((await harness.post("/api/guest/exchange", { token: olderUnused })).statusCode).toBe(410);
    expect((await harness.post("/api/guest/exchange", { token: fresh })).statusCode).toBe(200);
  });

  it("answers 429 RATE_LIMITED on the fourth request within the window, without retryAfter", async () => {
    const { email } = await harness.bookingWithLink();
    for (let i = 0; i < 3; i += 1) expect((await harness.post("/api/guest/resend", { email })).statusCode).toBe(204);

    const limited = await harness.post("/api/guest/resend", { email });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: { code: "RATE_LIMITED", message: expect.any(String) } });
  });

});

describe("POST /api/guest/resend rejections", () => {
  it.each([
    ["a malformed email", { email: "not-an-email" }],
    ["a missing email", {}],
    ["an overlong email", { email: `${"a".repeat(250)}@x.io` }],
    ["an unknown field", { email: "a@example.com", extra: 1 }],
  ])("answers 400 for %s", async (_name, payload) => {
    expect((await harness.post("/api/guest/resend", payload)).statusCode).toBe(400);
  });

  it("answers 403 without a CSRF token", async () => {
    const response = await harness.app().inject({ method: "POST", url: "/api/guest/resend", headers: { origin: "http://localhost:5173" }, payload: { email: "a@example.com" } });

    expect(response.statusCode).toBe(403);
  });
});
