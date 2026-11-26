import { describe, expect, it } from "vitest";
import { holderFrom } from "../../domain/holder.js";
import { insertSeatedEvent, seatRow } from "../../infrastructure/persistence/booking-test-support.js";
import { useBookingApp, vidCookie, visitorHashOf } from "./booking-route-test-support.js";

const holdUrl = (eventId: string, seatId: string): string => `/api/events/${eventId}/hold/seats/${seatId}`;
const notFound = { error: { code: "HOLD_NOT_FOUND", message: expect.any(String) } };

describe("DELETE /api/events/:eventId/hold/seats/:seatId", () => {
  const harness = useBookingApp();

  it("frees the holder's own seat with 204 and the seat map shows it available", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });

    const response = await harness.mutate("DELETE", holdUrl(eventId, seatIds[0] as string), vidCookie(1));

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    const map = await harness.get(`/api/events/${eventId}/seats`);
    expect(map.json<{ seats: { state: string }[] }>().seats.map((s) => s.state)).toEqual(["available"]);
  });

  it("answers 404 HOLD_NOT_FOUND to another visitor and leaves my seat held", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });

    const response = await harness.mutate("DELETE", holdUrl(eventId, seatIds[0] as string), vidCookie(2));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(notFound);
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).toBe("held");
  });

  it("answers 404 without identity and never issues a cookie", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);

    const response = await harness.mutate("DELETE", holdUrl(eventId, seatIds[0] as string));

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(notFound);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("enforces CSRF and Origin and leaves the seat held", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });
    const url = holdUrl(eventId, seatIds[0] as string);

    const noToken = await harness.app().inject({ method: "DELETE", url, headers: { origin: "http://localhost:5173", ...vidCookie(1) } });
    const badOrigin = await harness.mutate("DELETE", url, { origin: "http://evil.example", ...vidCookie(1) });

    expect(noToken.statusCode).toBe(403);
    expect(noToken.json()).toEqual({ error: { code: "CSRF_INVALID", message: expect.any(String) } });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.json()).toEqual({ error: { code: "ORIGIN_INVALID", message: expect.any(String) } });
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).toBe("held");
  });
});
