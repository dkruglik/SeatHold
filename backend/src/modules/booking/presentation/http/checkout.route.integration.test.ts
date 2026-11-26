import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { testConfig } from "../../../auth/presentation/http/auth-route-test-support.js";
import type { PaymentGateway } from "../../application/ports/payment-gateway.js";
import { insertSeatedEvent, seatRow } from "../../infrastructure/persistence/booking-test-support.js";
import { useBookingApp, vidCookie } from "./booking-route-test-support.js";

const holdUrl = (eventId: string, seatId: string): string => `/api/events/${eventId}/hold/seats/${seatId}`;
const checkoutUrl = (eventId: string): string => `/api/events/${eventId}/hold/checkout`;
const ORIGIN = "http://localhost:5173";
const EMAIL = "guest@example.io";

const countRows = async (prisma: PrismaService, table: "bookings" | "tickets"): Promise<number> => {
  const rows = await prisma.client.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0]?.n ?? 0;
};

describe("POST /api/events/:eventId/hold/checkout", () => {
  const harness = useBookingApp();
  const pay = (eventId: string, body: object, headers: Record<string, string> = vidCookie(1)) => harness.mutate("POST", checkoutUrl(eventId), headers, body);
  const hold = (eventId: string, seatId: string, headers: Record<string, string> = vidCookie(1)) => harness.mutate("PUT", holdUrl(eventId, seatId), headers);

  it("confirms a guest checkout: 201 with the booking and tickets, no-store, seat sold, a second checkout is 404", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 2);
    await hold(eventId, seatIds[0] as string);

    const response = await pay(eventId, { paymentOutcome: "succeed", guestEmail: EMAIL });

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.cookies).toEqual([]);
    const booking = response.json<{ tickets: { seatId: string; code: string }[] }>();
    expect(booking).toEqual({
      id: expect.any(String), status: "confirmed", eventId, seatIds: [seatIds[0]], totalMinor: expect.any(Number), currency: expect.any(String),
      tickets: [{ seatId: seatIds[0], code: expect.stringMatching(/^[A-Za-z0-9_-]{22,}$/) }],
    });
    const map = await harness.get(`/api/events/${eventId}/seats`);
    expect(map.json<{ seats: { id: string; state: string }[] }>().seats.find((s) => s.id === seatIds[0])?.state).toBe("sold");
    const stored = await harness.prisma.client.$queryRaw<{ guest_email: string | null }[]>`SELECT guest_email::text FROM bookings`;
    expect(stored).toEqual([{ guest_email: EMAIL }]);

    const again = await pay(eventId, { paymentOutcome: "succeed", guestEmail: EMAIL });

    expect(again.statusCode).toBe(404);
    expect(again.json()).toEqual({ error: { code: "HOLD_NOT_FOUND", message: expect.any(String) } });
    expect(await countRows(harness.prisma, "bookings")).toBe(1);
  });

  it("answers 400 GUEST_EMAIL_INVALID for a guest without a valid email and changes nothing", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await hold(eventId, seatIds[0] as string);

    for (const body of [{ paymentOutcome: "succeed" }, { paymentOutcome: "succeed", guestEmail: "not-an-email" }]) {
      const response = await pay(eventId, body);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { code: "GUEST_EMAIL_INVALID", message: expect.any(String) } });
    }
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).toBe("held");
    expect(await countRows(harness.prisma, "bookings")).toBe(0);
  });

  it("answers 402 PAYMENT_FAILED on fail, keeps the hold, and a retry with succeed then works", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await hold(eventId, seatIds[0] as string);

    const failed = await pay(eventId, { paymentOutcome: "fail", guestEmail: EMAIL });

    expect(failed.statusCode).toBe(402);
    expect(failed.json()).toEqual({ error: { code: "PAYMENT_FAILED", message: expect.any(String) } });
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).toBe("held");
    expect((await pay(eventId, { paymentOutcome: "succeed", guestEmail: EMAIL })).statusCode).toBe(201);
  });

});

describe("POST /api/events/:eventId/hold/checkout, identity and expiry", () => {
  const harness = useBookingApp();
  const pay = (eventId: string, body: object, headers: Record<string, string> = vidCookie(1)) => harness.mutate("POST", checkoutUrl(eventId), headers, body);
  const hold = (eventId: string, seatId: string, headers: Record<string, string> = vidCookie(1)) => harness.mutate("PUT", holdUrl(eventId, seatId), headers);

  it("checks out a signed-in user without an email and stores the user on the booking", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    const { userId, headers } = await harness.signedInUser("ada@example.io");
    await hold(eventId, seatIds[0] as string, headers);

    const response = await pay(eventId, { paymentOutcome: "succeed" }, headers);

    expect(response.statusCode).toBe(201);
    const rows = await harness.prisma.client.$queryRaw<{ user_id: string | null; guest_email: string | null }[]>`SELECT user_id, guest_email::text FROM bookings`;
    expect(rows).toEqual([{ user_id: userId, guest_email: null }]);
  });

  it("adopts a visitor hold on checkout when the request carries a session and a vid cookie", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await hold(eventId, seatIds[0] as string);
    const { userId, headers } = await harness.signedInUser("ada@example.io");

    const response = await pay(eventId, { paymentOutcome: "succeed" }, { cookie: `${headers.cookie}; ${vidCookie(1).cookie}` });

    expect(response.statusCode).toBe(201);
    expect(response.cookies.find((c) => c.name === "vid")?.value).toBe("");
    const rows = await harness.prisma.client.$queryRaw<{ user_id: string | null }[]>`SELECT user_id FROM bookings`;
    expect(rows).toEqual([{ user_id: userId }]);
  });

  it("answers 404 HOLD_NOT_FOUND to another visitor, to a request without identity, and issues no cookie", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await hold(eventId, seatIds[0] as string);

    const other = await pay(eventId, { paymentOutcome: "succeed", guestEmail: EMAIL }, vidCookie(2));
    const anonymous = await pay(eventId, { paymentOutcome: "succeed", guestEmail: EMAIL }, {});

    for (const response of [other, anonymous]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { code: "HOLD_NOT_FOUND", message: expect.any(String) } });
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).toBe("held");
  });

  it("answers 409 HOLD_EXPIRED once the hold is past its expiry, and sells nothing", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await hold(eventId, seatIds[0] as string);
    harness.clock.advance(testConfig().holdDurationMinutes * 60_000 + 1_000);

    const response = await pay(eventId, { paymentOutcome: "succeed", guestEmail: EMAIL });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: "HOLD_EXPIRED", message: expect.any(String) } });
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).not.toBe("sold");
    expect(await countRows(harness.prisma, "tickets")).toBe(0);
  });
});

describe("POST /api/events/:eventId/hold/checkout, late payment", () => {
  const slowGateway = (clock: { advance(ms: number): void }): PaymentGateway => ({
    authorize: () => {
      clock.advance(60 * 60_000);
      return Promise.resolve({ outcome: "succeeded" });
    },
  });
  const harness = useBookingApp({}, slowGateway);

  it("answers 409 HOLD_EXPIRED and creates no ticket when the clock passes expiry during authorize", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.mutate("PUT", holdUrl(eventId, seatIds[0] as string), vidCookie(1));

    const response = await harness.mutate("POST", checkoutUrl(eventId), vidCookie(1), { paymentOutcome: "succeed", guestEmail: EMAIL });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: { code: "HOLD_EXPIRED", message: expect.any(String) } });
    expect(await countRows(harness.prisma, "tickets")).toBe(0);
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).not.toBe("sold");
  });
});

describe("POST /api/events/:eventId/hold/checkout, rejected requests", () => {
  const harness = useBookingApp();

  it("enforces CSRF and Origin and leaves the hold untouched", async () => {
    const { eventId, seatIds } = await insertSeatedEvent(harness.prisma, 1);
    await harness.mutate("PUT", holdUrl(eventId, seatIds[0] as string), vidCookie(1));
    const payload = { paymentOutcome: "succeed", guestEmail: EMAIL };

    const noToken = await harness.app().inject({ method: "POST", url: checkoutUrl(eventId), headers: { origin: ORIGIN, ...vidCookie(1) }, payload });
    const badOrigin = await harness.mutate("POST", checkoutUrl(eventId), { ...vidCookie(1), origin: "http://evil.example" }, payload);

    expect(noToken.statusCode).toBe(403);
    expect(noToken.json()).toEqual({ error: { code: "CSRF_INVALID", message: expect.any(String) } });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.json()).toEqual({ error: { code: "ORIGIN_INVALID", message: expect.any(String) } });
    expect((await seatRow(harness.prisma, seatIds[0] as string)).status).toBe("held");
  });

  it("answers 400 for unknown fields, a bad outcome, an overlong email and a non-uuid event", async () => {
    const { eventId } = await insertSeatedEvent(harness.prisma, 1);
    const bodies = [
      { paymentOutcome: "succeed", extra: 1 },
      { paymentOutcome: "maybe" },
      {},
      { paymentOutcome: "succeed", guestEmail: `${"a".repeat(250)}@x.io` },
    ];

    for (const body of bodies) {
      expect((await harness.mutate("POST", checkoutUrl(eventId), vidCookie(1), body)).statusCode).toBe(400);
    }
    expect((await harness.mutate("POST", checkoutUrl("x"), vidCookie(1), { paymentOutcome: "succeed" })).statusCode).toBe(400);
  });
});
