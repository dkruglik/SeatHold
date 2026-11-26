import { describe, expect, it } from "vitest";
import { holderFrom } from "../../domain/holder.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { insertSeatedEvent, seatRow } from "../../infrastructure/persistence/booking-test-support.js";
import { useBookingApp, vidCookie, visitorHashOf } from "./booking-route-test-support.js";

interface HoldColumns {
  readonly id: string;
  readonly user_id: string | null;
  readonly visitor_hash: string | null;
  readonly status: string;
  readonly expires_at: Date;
}

const holdColumns = (prisma: PrismaService, eventId: string): Promise<HoldColumns[]> =>
  prisma.client.$queryRaw<HoldColumns[]>`SELECT id, user_id, visitor_hash, status, expires_at FROM holds WHERE event_id = ${eventId}::uuid ORDER BY status`;

describe("adoption of visitor holds after login (plan flow 9)", () => {
  const harness = useBookingApp();
  const holdsOf = (eventId: string): Promise<HoldColumns[]> => holdColumns(harness.prisma, eventId);

  it("moves the visitor hold to the user, clears vid, and the user's current hold returns it", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 2);
    const visitorHolder = holderFrom({ visitorHash: visitorHashOf(1) });
    await harness.booking().holdSeat.hold({ holder: visitorHolder, eventId, seatId: seatIds[0] as string });
    const hold = await harness.booking().holdSeat.hold({ holder: visitorHolder, eventId, seatId: seatIds[1] as string });
    const { userId, headers } = await harness.signedInUser("ada@example.io");

    const response = await harness.get(`/api/events/${eventId}/hold`, { cookie: `${headers.cookie}; ${vidCookie(1).cookie}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ seatIds: [seatIds[0], seatIds[1]], expiresAt: hold.expiresAt.toISOString() });
    const cleared = response.cookies.find((c) => c.name === "vid");
    expect(cleared).toMatchObject({ value: "", path: "/api" });
    expect(cleared?.expires?.getTime()).toBeLessThan(Date.now());
    expect(await holdsOf(eventId)).toEqual([{ id: hold.holdId, user_id: userId, visitor_hash: null, status: "active", expires_at: hold.expiresAt }]);

    const later = await harness.get(`/api/events/${eventId}/hold`, headers);
    expect(later.json<{ seatIds: string[] }>().seatIds).toEqual([seatIds[0], seatIds[1]]);
  });

  it("releases the visitor's seats when the user already holds seats for that event, keeping the user's hold", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 3);
    const { userId, headers } = await harness.signedInUser("ada@example.io");
    const userHold = await harness.booking().holdSeat.hold({ holder: holderFrom({ userId }), eventId, seatId: seatIds[0] as string });
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[1] as string });

    const response = await harness.get(`/api/events/${eventId}/hold`, { cookie: `${headers.cookie}; ${vidCookie(1).cookie}` });

    expect(response.json()).toEqual({ seatIds: [seatIds[0]], expiresAt: userHold.expiresAt.toISOString() });
    expect(response.cookies.find((c) => c.name === "vid")?.value).toBe("");
    expect((await seatRow(harness.prisma, seatIds[1] as string)).status).toBe("available");
    expect((await seatRow(harness.prisma, seatIds[0] as string)).hold_id).toBe(userHold.holdId);
    expect((await holdsOf(eventId)).map((h) => [h.user_id, h.status])).toEqual([[userId, "active"], [null, "released"]]);
  });

});

describe("adoption of visitor holds after login: other requests", () => {
  const harness = useBookingApp();
  const holdsOf = (eventId: string): Promise<HoldColumns[]> => holdColumns(harness.prisma, eventId);

  it("is a no-op that still clears the cookie when the visitor holds nothing, and runs on hold and release requests too", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    const { headers } = await harness.signedInUser("ada@example.io");
    const cookie = `${headers.cookie}; ${vidCookie(1).cookie}`;

    const put = await harness.mutate("PUT", `/api/events/${eventId}/hold/seats/${seatIds[0] as string}`, { cookie });
    const del = await harness.mutate("DELETE", `/api/events/${eventId}/hold/seats/${seatIds[0] as string}`, { cookie });

    expect(put.statusCode).toBe(200);
    expect(put.cookies.find((c) => c.name === "vid")?.value).toBe("");
    expect(del.statusCode).toBe(204);
    expect(del.cookies.find((c) => c.name === "vid")?.value).toBe("");
  });

  it("does not run on the public seat map and keeps the cookie", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });
    const { headers } = await harness.signedInUser("ada@example.io");

    const response = await harness.get(`/api/events/${eventId}/seats`, { cookie: `${headers.cookie}; ${vidCookie(1).cookie}` });

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect((await holdsOf(eventId))[0]?.visitor_hash).toBe(visitorHashOf(1));
  });

  it("adopts nothing without a session", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.booking().holdSeat.hold({ holder: holderFrom({ visitorHash: visitorHashOf(1) }), eventId, seatId: seatIds[0] as string });

    const response = await harness.get(`/api/events/${eventId}/hold`, vidCookie(1));

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});
