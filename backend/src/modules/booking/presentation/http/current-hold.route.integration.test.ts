import { describe, expect, it } from "vitest";
import { holderFrom } from "../../domain/holder.js";
import { insertSeatedEvent } from "../../infrastructure/persistence/booking-test-support.js";
import { useBookingApp, vidCookie, visitorHashOf } from "./booking-route-test-support.js";

const notFound = { error: { code: "HOLD_NOT_FOUND", message: expect.any(String) } };

describe("GET /api/events/:eventId/hold", () => {
  const harness = useBookingApp();

  it("answers 404 HOLD_NOT_FOUND without identity, uncached and without setting a cookie", async () => {
    const { eventId } = await insertSeatedEvent(harness.prisma, 1);

    const response = await harness.get(`/api/events/${eventId}/hold`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(notFound);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("returns the hold of the visitor whose cookie made it, uncached", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 2);
    const holder = holderFrom({ visitorHash: visitorHashOf(1) });
    await harness.booking().holdSeat.hold({ holder, eventId, seatId: seatIds[0] as string });
    const hold = await harness.booking().holdSeat.hold({ holder, eventId, seatId: seatIds[1] as string });

    const response = await harness.get(`/api/events/${eventId}/hold`, vidCookie(1));

    expect(response.statusCode).toBe(200);
    const body = response.json<{ seatIds: string[]; expiresAt: string }>();
    expect([...body.seatIds].sort()).toEqual([...seatIds].sort());
    expect(body.expiresAt).toBe(hold.expiresAt.toISOString());
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "seatIds"]);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("answers 404 for another visitor and for a malformed cookie", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });

    const other = await harness.get(`/api/events/${eventId}/hold`, vidCookie(2));
    const malformed = await harness.get(`/api/events/${eventId}/hold`, { cookie: "vid=garbage" });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual(notFound);
    expect(malformed.statusCode).toBe(404);
    expect(malformed.headers["set-cookie"]).toBeUndefined();
  });
});

describe("GET /api/events/:eventId/hold for a signed-in user", () => {
  const harness = useBookingApp();

  it("resolves the hold of the signed-in user, and the user wins over a visitor cookie", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 2);
    const { userId, headers } = await harness.signedInUser("ada@example.io");
    await harness.booking().holdSeat.hold({ holder: holderFrom({ userId }), eventId, seatId: seatIds[0] as string });
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[1] as string });

    const response = await harness.get(`/api/events/${eventId}/hold`, { cookie: `${headers.cookie}; ${vidCookie(1).cookie}` });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ seatIds: string[] }>().seatIds).toEqual([seatIds[0]]);
  });

  it("answers 404 for a signed-in user without a hold", async () => {
    const { eventId } = await insertSeatedEvent(harness.prisma, 1);
    const { headers } = await harness.signedInUser("ada@example.io");

    expect((await harness.get(`/api/events/${eventId}/hold`, headers)).statusCode).toBe(404);
  });

  it("answers 400 for an event id that is not a uuid", async () => {
    expect((await harness.get("/api/events/x/hold")).statusCode).toBe(400);
  });
});
