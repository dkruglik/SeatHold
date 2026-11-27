import { describe, expect, it } from "vitest";
import { holderFrom } from "../../domain/holder.js";
import { holdRows, insertSeatedEvent, seatRow } from "../../infrastructure/persistence/booking-test-support.js";
import { useBookingApp, vidCookie, visitorHashOf } from "./booking-route-test-support.js";

const holdUrl = (eventId: string, seatId: string): string => `/api/events/${eventId}/hold/seats/${seatId}`;
const ORIGIN = "http://localhost:5173";

describe("PUT /api/events/:eventId/hold/seats/:seatId", () => {
  const harness = useBookingApp({ maxSeatsPerHold: 2 });

  it("issues the vid cookie on the first hold, returns 200 with the hold, and a second seat joins it keeping expiresAt", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 3);

    const first = await harness.mutate("PUT", holdUrl(eventId, seatIds[0] as string));

    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    const set = first.cookies.find((c) => c.name === "vid");
    expect(set).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api" });
    expect(first.json()).toEqual({ seatIds: [seatIds[0]], expiresAt: expect.any(String) });
    harness.clock.advance(60_000);

    const second = await harness.mutate("PUT", holdUrl(eventId, seatIds[1] as string), { cookie: `vid=${set?.value}` });

    expect(second.statusCode).toBe(200);
    expect(second.cookies).toEqual([]);
    expect(second.json()).toEqual({ seatIds: [seatIds[0], seatIds[1]], expiresAt: first.json<{ expiresAt: string }>().expiresAt });
    expect(await holdRows(harness.prisma, eventId)).toHaveLength(1);
  });

  it("answers 409 SEAT_UNAVAILABLE to a second visitor on the same seat", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.mutate("PUT", holdUrl(eventId, seatIds[0] as string), vidCookie(1));

    const response = await harness.mutate("PUT", holdUrl(eventId, seatIds[0] as string), vidCookie(2));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: "SEAT_UNAVAILABLE", message: expect.any(String) } });
  });

  it("answers 409 HOLD_LIMIT_REACHED beyond MAX_SEATS_PER_HOLD", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 3);
    await harness.mutate("PUT", holdUrl(eventId, seatIds[0] as string), vidCookie(1));
    await harness.mutate("PUT", holdUrl(eventId, seatIds[1] as string), vidCookie(1));

    const response = await harness.mutate("PUT", holdUrl(eventId, seatIds[2] as string), vidCookie(1));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: "HOLD_LIMIT_REACHED", message: expect.any(String) } });
    expect((await seatRow(harness.prisma, seatIds[2] as string)).status).toBe("available");
  });

  it("holds for the signed-in user, not for the visitor cookie, and issues no cookie", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    const { userId, headers } = await harness.signedInUser("ada@example.io");

    const response = await harness.mutate("PUT", holdUrl(eventId, seatIds[0] as string), headers);

    expect(response.statusCode).toBe(200);
    expect(response.cookies).toEqual([]);
    const rows = await harness.prisma.client.$queryRaw<{ user_id: string | null }[]>`SELECT user_id FROM holds WHERE event_id = ${eventId}::uuid`;
    expect(rows).toEqual([{ user_id: userId }]);
  });

});

describe("PUT /api/events/:eventId/hold/seats/:seatId, rejected requests", () => {
  const harness = useBookingApp();

  it("answers 400 for ids that are not uuids", async () => {
    expect((await harness.mutate("PUT", "/api/events/x/hold/seats/y")).statusCode).toBe(400);
  });

  it("enforces CSRF and Origin and leaves the seat untouched", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    const url = holdUrl(eventId, seatIds[0] as string);

    const noToken = await harness.app().inject({ method: "PUT", url, headers: { origin: ORIGIN } });
    const badOrigin = await harness.mutate("PUT", url, { origin: "http://evil.example" });

    expect(noToken.statusCode).toBe(403);
    expect(noToken.json()).toEqual({ error: { code: "CSRF_INVALID", message: expect.any(String) } });
    expect(noToken.headers["set-cookie"]).toBeUndefined();
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.json()).toEqual({ error: { code: "ORIGIN_INVALID", message: expect.any(String) } });
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).toBe("available");
  });

  it("keeps a visitor hold made through the service visible to the same cookie", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 2);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });

    const response = await harness.mutate("PUT", holdUrl(eventId, seatIds[1] as string), vidCookie(1));

    expect(response.json<{ seatIds: string[] }>().seatIds).toEqual([seatIds[0], seatIds[1]]);
  });
});
