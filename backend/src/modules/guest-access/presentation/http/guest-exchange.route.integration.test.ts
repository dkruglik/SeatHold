import { describe, expect, it } from "vitest";
import { MS_PER_DAY, EVENT_STARTS_AT, useGuestApp } from "./guest-route-test-support.js";

const harness = useGuestApp();
const gsidOf = (response: { cookies: { name: string; value: string }[] }): string => response.cookies.find((c) => c.name === "gsid")?.value ?? "";

describe("POST /api/guest/exchange", () => {
  it("sets the gsid cookie and returns the booking with its tickets, then GET /api/guest/booking returns it with that cookie", async () => {
    const { token, bookingId, ticketCode } = await harness.bookingWithLink();

    const response = await harness.post("/api/guest/exchange", { token });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const cookie = response.cookies.find((c) => c.name === "gsid");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api" });
    expect(cookie?.secure).toBeUndefined();
    expect(cookie?.expires?.getTime()).toBe(EVENT_STARTS_AT.getTime() + MS_PER_DAY);
    expect(response.json()).toMatchObject({ bookingId, status: "confirmed", tickets: [{ code: ticketCode, rowLabel: "A", seatNumber: 1 }] });

    const booking = await harness.get("/api/guest/booking", { cookie: `gsid=${gsidOf(response)}` });
    expect(booking.statusCode).toBe(200);
    expect(booking.headers["cache-control"]).toBe("no-store");
    expect(booking.headers.vary).toBe("Cookie");
    expect(booking.json()).toEqual(response.json());
  });

  it("answers 410 LINK_USED for the second exchange of the same link", async () => {
    const { token } = await harness.bookingWithLink();
    await harness.post("/api/guest/exchange", { token });

    const again = await harness.post("/api/guest/exchange", { token });

    expect(again.statusCode).toBe(410);
    expect(again.json()).toEqual({ error: { code: "LINK_USED", message: expect.any(String) } });
    expect(gsidOf(again)).toBe("");
  });

  it("answers 410 LINK_EXPIRED once the link lifetime has passed", async () => {
    const { token } = await harness.bookingWithLink();
    harness.clock.advance(169 * 3_600_000);

    const response = await harness.post("/api/guest/exchange", { token });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toEqual({ error: { code: "LINK_EXPIRED", message: expect.any(String) } });
  });

  it("answers 410 LINK_INVALID for an unknown token", async () => {
    const response = await harness.post("/api/guest/exchange", { token: "x".repeat(43) });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toEqual({ error: { code: "LINK_INVALID", message: expect.any(String) } });
  });

});

describe("POST /api/guest/exchange rejections and logs", () => {
  it.each([
    ["a missing token", {}],
    ["a token that is too short", { token: "short" }],
    ["a token that is too long", { token: "x".repeat(201) }],
    ["a non-string token", { token: { nested: "x".repeat(43) } }],
    ["an unknown field", { token: "x".repeat(43), extra: 1 }],
  ])("answers 400 for %s", async (_name, payload) => {
    const response = await harness.post("/api/guest/exchange", payload);

    expect(response.statusCode).toBe(400);
  });

  it("answers 403 without a CSRF token and with a foreign Origin, and consumes nothing", async () => {
    const { token } = await harness.bookingWithLink();

    const noCsrf = await harness.app().inject({ method: "POST", url: "/api/guest/exchange", headers: { origin: "http://localhost:5173" }, payload: { token } });
    const foreign = await harness.post("/api/guest/exchange", { token }, { origin: "https://evil.example" });

    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json()).toEqual({ error: { code: "CSRF_INVALID", message: expect.any(String) } });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json()).toEqual({ error: { code: "ORIGIN_INVALID", message: expect.any(String) } });
    expect((await harness.post("/api/guest/exchange", { token })).statusCode).toBe(200);
  });

  it("never writes the token or the gsid value to the logs", async () => {
    const { token } = await harness.bookingWithLink();
    const used = await harness.post("/api/guest/exchange", { token });
    const session = gsidOf(used);
    await harness.get("/api/guest/booking", { cookie: `gsid=${session}` });
    await harness.post("/api/guest/exchange", { token });
    await harness.post("/api/guest/exchange", { token: "unknown-token-".repeat(4) });

    expect(session).not.toBe("");
    expect(harness.logs()).not.toContain(token);
    expect(harness.logs()).not.toContain(session);
    expect(harness.logs()).not.toContain("unknown-token-");
  });
});
