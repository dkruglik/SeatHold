import { describe, expect, it } from "vitest";
import { PrismaUserRepository } from "../../../auth/index.js";
import { cookieHeader, sidOf, testConfig, useAuthApp } from "../../../auth/presentation/http/auth-route-test-support.js";
import { createBookingServices, holderFrom, HoldNotFound, type BookingServices } from "../../../booking/index.js";
import { holdSeat, seatState, seedBooking, seedEvent, releaseLogRows } from "./admin-read-test-support.js";

const harness = useAuthApp();
const url = (eventId: string, seatId: string): string => `/api/admin/events/${eventId}/seats/${seatId}/release`;
const REASON = "Buyer phoned: abandoned checkout";
const visitor = (n: number) => holderFrom({ visitorHash: `${n}`.padStart(64, "a") });

const adminSession = async (email = "root@example.io"): Promise<{ headers: Record<string, string>; userId: string }> => {
  const sid = sidOf(await harness.login(email));
  await new PrismaUserRepository(harness.prisma).setRoleByEmail(email, "admin");
  const [user] = await harness.prisma.client.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE email = ${email}`;
  return { headers: cookieHeader(sid), userId: user?.id ?? "" };
};
const bookingServices = (): BookingServices => {
  const config = testConfig();
  return createBookingServices({ prisma: harness.prisma, clock: harness.clock, holdDurationMinutes: config.holdDurationMinutes, maxSeatsPerHold: config.maxSeatsPerHold });
};
const holdStatus = async (seatId: string): Promise<string | undefined> => {
  const rows = await harness.prisma.client.$queryRaw<{ status: string }[]>`
    SELECT h.status FROM holds h JOIN seats s ON s.hold_id = h.id WHERE s.id = ${seatId}::uuid`;
  return rows[0]?.status;
};
const holdStatusById = async (holdId: string): Promise<string | undefined> =>
  (await harness.prisma.client.$queryRaw<{ status: string }[]>`SELECT status FROM holds WHERE id = ${holdId}::uuid`)[0]?.status;

describe("POST /api/admin/events/:eventId/seats/:seatId/release", () => {
  it("frees a held seat: 200 no-store, seat available with hold fields cleared, one log row with admin, reason and clock time", async () => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    await holdSeat(harness.prisma, eventId, seat.A1 as string, new Date("2030-01-01T10:10:00Z"));
    const admin = await adminSession();
    const at = await harness.clock.now();

    const response = await harness.post(url(eventId, seat.A1 as string), { reason: `  ${REASON}  ` }, admin.headers);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ seatId: seat.A1, eventId, released: true });
    expect(await seatState(harness.prisma, seat.A1 as string)).toEqual({ status: "available", hold_id: null, held_until: null });
    expect(await releaseLogRows(harness.prisma)).toEqual([
      { seat_id: seat.A1, event_id: eventId, hold_id: expect.any(String), admin_user_id: admin.userId, reason: REASON, created_at: at },
    ]);
  });

  it("frees a seat whose hold has already expired (status still held): 200 and one log row", async () => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    await holdSeat(harness.prisma, eventId, seat.A1 as string, new Date("2029-12-31T10:00:00Z"));
    const admin = await adminSession();

    const response = await harness.post(url(eventId, seat.A1 as string), { reason: REASON }, admin.headers);

    expect(response.statusCode).toBe(200);
    expect(await seatState(harness.prisma, seat.A1 as string)).toEqual({ status: "available", hold_id: null, held_until: null });
    expect(await releaseLogRows(harness.prisma)).toHaveLength(1);
  });

  it("keeps the buyer's other seat held and the hold active", async () => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1], ["A", 2]] });
    const booking = bookingServices();
    await booking.holdSeat.hold({ holder: visitor(1), eventId, seatId: seat.A1 as string });
    await booking.holdSeat.hold({ holder: visitor(1), eventId, seatId: seat.A2 as string });
    const admin = await adminSession();

    const response = await harness.post(url(eventId, seat.A1 as string), { reason: REASON }, admin.headers);

    expect(response.statusCode).toBe(200);
    expect((await seatState(harness.prisma, seat.A2 as string)).status).toBe("held");
    expect(await holdStatus(seat.A2 as string)).toBe("active");
  });

  it("marks the hold released when its last seat is freed; the buyer cannot check out it and another buyer can take the seat", async () => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    const booking = bookingServices();
    await booking.holdSeat.hold({ holder: visitor(1), eventId, seatId: seat.A1 as string });
    const [{ hold_id: holdId }] = await harness.prisma.client.$queryRaw<[{ hold_id: string }]>`SELECT hold_id FROM seats WHERE id = ${seat.A1 as string}::uuid`;
    const admin = await adminSession();

    const response = await harness.post(url(eventId, seat.A1 as string), { reason: REASON }, admin.headers);

    expect(response.statusCode).toBe(200);
    expect(await holdStatusById(holdId)).toBe("released");
    await expect(booking.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "succeed", guestEmail: "b@example.io" })).rejects.toBeInstanceOf(HoldNotFound);
    await booking.holdSeat.hold({ holder: visitor(2), eventId, seatId: seat.A1 as string });
    expect((await seatState(harness.prisma, seat.A1 as string)).status).toBe("held");
  });

});

describe("POST /api/admin/events/:eventId/seats/:seatId/release: seats that cannot be released", () => {
  it("answers 409 SEAT_NOT_HELD for a sold seat and writes no log row", async () => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    await seedBooking(harness.prisma, { eventId, seatIds: [seat.A1 as string], guestEmail: "g@example.io", createdAt: new Date("2030-01-01T09:30:00Z") });
    const admin = await adminSession();

    const response = await harness.post(url(eventId, seat.A1 as string), { reason: REASON }, admin.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: "SEAT_NOT_HELD", message: expect.any(String) } });
    expect((await seatState(harness.prisma, seat.A1 as string)).status).toBe("sold");
    expect(await releaseLogRows(harness.prisma)).toEqual([]);
  });

  it("answers 409 SEAT_NOT_HELD for an available seat", async () => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    const admin = await adminSession();

    const response = await harness.post(url(eventId, seat.A1 as string), { reason: REASON }, admin.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "SEAT_NOT_HELD" } });
    expect(await releaseLogRows(harness.prisma)).toEqual([]);
  });

  it("answers 404 for a seat of another event and for an unknown seat, leaving the held seat held", async () => {
    const first = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    const second = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    await holdSeat(harness.prisma, first.eventId, first.seat.A1 as string, new Date("2030-01-01T10:10:00Z"));
    const admin = await adminSession();

    const crossEvent = await harness.post(url(second.eventId, first.seat.A1 as string), { reason: REASON }, admin.headers);
    const unknown = await harness.post(url(first.eventId, "0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11"), { reason: REASON }, admin.headers);

    expect(crossEvent.statusCode).toBe(404);
    expect(crossEvent.json()).toEqual({ error: { code: "SEAT_NOT_FOUND", message: expect.any(String) } });
    expect(unknown.statusCode).toBe(404);
    expect((await seatState(harness.prisma, first.seat.A1 as string)).status).toBe("held");
    expect(await releaseLogRows(harness.prisma)).toEqual([]);
  });

});

describe("POST /api/admin/events/:eventId/seats/:seatId/release: refused requests", () => {
  it.each([
    ["missing", {}],
    ["too short", { reason: "ab" }],
    ["blank", { reason: "      " }],
    ["too long", { reason: "a".repeat(501) }],
    ["not a string", { reason: { text: REASON } }],
    ["an unknown field next to a valid reason", { reason: REASON, adminUserId: "someone-else" }],
  ])("answers 400 for a reason that is %s and leaves the seat held", async (_name, body) => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    await holdSeat(harness.prisma, eventId, seat.A1 as string, new Date("2030-01-01T10:10:00Z"));
    const admin = await adminSession();

    const response = await harness.post(url(eventId, seat.A1 as string), body, admin.headers);

    expect(response.statusCode).toBe(400);
    expect((await seatState(harness.prisma, seat.A1 as string)).status).toBe("held");
    expect(await releaseLogRows(harness.prisma)).toEqual([]);
  });

  it("answers anonymous 401, buyer 403 and a request without CSRF 403, changing nothing", async () => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    await holdSeat(harness.prisma, eventId, seat.A1 as string, new Date("2030-01-01T10:10:00Z"));
    const buyer = cookieHeader(sidOf(await harness.login("ada@example.io")));
    const admin = await adminSession();

    const anonymous = await harness.post(url(eventId, seat.A1 as string), { reason: REASON });
    const asBuyer = await harness.post(url(eventId, seat.A1 as string), { reason: REASON }, buyer);
    const noCsrf = await harness.postBare(url(eventId, seat.A1 as string), { reason: REASON }, { ...admin.headers, origin: "http://localhost:5173" });

    expect([anonymous.statusCode, asBuyer.statusCode, noCsrf.statusCode]).toEqual([401, 403, 403]);
    expect(noCsrf.json()).toMatchObject({ error: { code: "CSRF_INVALID" } });
    expect((await seatState(harness.prisma, seat.A1 as string)).status).toBe("held");
    expect(await releaseLogRows(harness.prisma)).toEqual([]);
  });

  it("two concurrent releases of one seat: exactly one 200, one 409, one log row", async () => {
    const { eventId, seat } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    await holdSeat(harness.prisma, eventId, seat.A1 as string, new Date("2030-01-01T10:10:00Z"));
    const admin = await adminSession();

    const responses = await Promise.all([1, 2].map(() => harness.post(url(eventId, seat.A1 as string), { reason: REASON }, admin.headers)));

    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await releaseLogRows(harness.prisma)).toHaveLength(1);
  });
});
