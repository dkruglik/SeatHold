import { describe, expect, it } from "vitest";
import { holderFrom } from "../../domain/holder.js";
import { insertSeatedEvent, markSold } from "../../infrastructure/persistence/booking-test-support.js";
import { useBookingApp, visitorHashOf } from "./booking-route-test-support.js";

const UNKNOWN_EVENT = "00000000-0000-4000-8000-000000000000";

describe("GET /api/events/:eventId/seats", () => {
  const harness = useBookingApp();

  it("returns the event summary and the public state of every seat, with no holder data", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 3);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[1] as string });
    await markSold(harness.prisma, seatIds[2] as string);

    const response = await harness.get(`/api/events/${eventId}/seats`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      event: { id: eventId, priceMinor: 5000, currency: "EUR" },
      seats: [
        { id: seatIds[0], row: "A", number: 1, state: "available" },
        { id: seatIds[1], row: "A", number: 2, state: "held" },
        { id: seatIds[2], row: "A", number: 3, state: "sold" },
      ],
    });
    expect(response.body).not.toContain(visitorHashOf(1));
  });

  it("is identical for an anonymous client and a signed-in user, and sets no cookie for either", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 2);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });
    const { headers } = await harness.signedInUser("ada@example.io");

    const anonymous = await harness.get(`/api/events/${eventId}/seats`);
    const signedIn = await harness.get(`/api/events/${eventId}/seats`, headers);

    expect(signedIn.body).toBe(anonymous.body);
    expect(anonymous.headers["set-cookie"]).toBeUndefined();
    expect(signedIn.headers["set-cookie"]).toBeUndefined();
  });

  it("is cacheable for one second", async () => {
    const { eventId } = await insertSeatedEvent(harness.prisma, 1);

    const response = await harness.get(`/api/events/${eventId}/seats`);

    expect(response.headers["cache-control"]).toBe("public, max-age=1");
  });

});

describe("GET /api/events/:eventId/seats edge cases", () => {
  const harness = useBookingApp();

  it("shows a hold past its expiry as available", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    const hold = await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });
    harness.clock.set(hold.expiresAt);

    const response = await harness.get(`/api/events/${eventId}/seats`);

    expect(response.json<{ seats: { state: string }[] }>().seats[0]?.state).toBe("available");
  });

  it("answers 404 EVENT_NOT_FOUND for an unknown event", async () => {
    const response = await harness.get(`/api/events/${UNKNOWN_EVENT}/seats`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: "EVENT_NOT_FOUND", message: expect.any(String) } });
  });

  it("answers 400 for an event id that is not a uuid", async () => {
    const response = await harness.get("/api/events/not-a-uuid/seats");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: "invalid_request", message: expect.any(String) } });
  });
});
