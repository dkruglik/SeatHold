import { describe, expect, it } from "vitest";
import { insertSeatedEvent } from "../../infrastructure/persistence/booking-test-support.js";
import { insertUserBooking } from "../../infrastructure/persistence/my-bookings-test-support.js";
import { useBookingApp } from "./booking-route-test-support.js";

const URL = "/api/me/bookings";
interface Listed { bookingId: string; status: string; createdAt: string; totalMinor: number; currency: string; event: Record<string, unknown>; tickets: { ticketId: string; code: string; rowLabel: string; seatNumber: number }[] }

describe("GET /api/me/bookings", () => {
  const harness = useBookingApp();

  it("answers 401 to an anonymous caller", async () => {
    const response = await harness.get(URL);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("lists the caller's confirmed bookings newest first with ticket codes, and never another user's or a rejected one", async () => {
    const me = await harness.signedInUser("me@example.io");
    const other = await harness.signedInUser("other@example.io");
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 6);
    const older = await insertUserBooking(harness.prisma, { userId: me.userId, eventId, seatIds: [seatIds[0] as string], createdAt: new Date("2026-01-01T10:00:00Z"), codePrefix: "old" });
    const newer = await insertUserBooking(harness.prisma, { userId: me.userId, eventId, seatIds: [seatIds[2] as string, seatIds[1] as string], createdAt: new Date("2026-01-02T10:00:00Z"), codePrefix: "new" });
    await insertUserBooking(harness.prisma, { userId: me.userId, eventId, seatIds: [seatIds[3] as string], createdAt: new Date("2026-01-03T10:00:00Z"), status: "rejected", codePrefix: "rej" });
    const theirs = await insertUserBooking(harness.prisma, { userId: other.userId, eventId, seatIds: [seatIds[4] as string, seatIds[5] as string], createdAt: new Date("2026-01-04T10:00:00Z"), codePrefix: "theirs" });

    const response = await harness.get(URL, me.headers);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.vary).toMatch(/cookie/i);
    expect(response.cookies).toEqual([]);
    const body = response.json<Listed[]>();
    expect(body.map((b) => b.bookingId)).toEqual([newer.bookingId, older.bookingId]);
    expect(body[0]).toEqual({
      bookingId: newer.bookingId, status: "confirmed", createdAt: "2026-01-02T10:00:00.000Z", totalMinor: 10000, currency: "EUR",
      event: { eventId, title: "Show", startsAt: "2026-02-01T12:00:00.000Z", venueName: expect.stringMatching(/^Hall /), city: "Berlin", timezone: "Europe/Berlin" },
      tickets: [
        { ticketId: expect.any(String), code: "new-1", rowLabel: "A", seatNumber: 2 },
        { ticketId: expect.any(String), code: "new-0", rowLabel: "A", seatNumber: 3 },
      ],
    });
    const text = JSON.stringify(body);
    for (const code of theirs.codes) expect(text).not.toContain(code);
    expect(text).not.toContain("rej-");

    const others = await harness.get(URL, other.headers);
    expect(others.json<Listed[]>().map((b) => b.bookingId)).toEqual([theirs.bookingId]);
  });

  it("returns an empty list for a signed-in user without bookings", async () => {
    const me = await harness.signedInUser("me@example.io");

    const response = await harness.get(URL, me.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});
