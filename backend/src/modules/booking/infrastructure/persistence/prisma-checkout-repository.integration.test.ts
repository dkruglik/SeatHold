import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../../shared/errors/app-error.js";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { HoldExpired, HoldNotFound, PaymentFailed } from "../../domain/errors.js";
import { holderFrom } from "../../domain/holder.js";
import { bookingTestServices, holdRows, insertSeatedEvent, insertUser, seatRow, T0, useBookingPool, visitor } from "./booking-test-support.js";
import { bookingRows, paymentRows, ticketRows } from "./checkout-test-support.js";

const prisma = useBookingPool();

async function holdTwo(holderArg = visitor(1)) {
  const services = bookingTestServices(prisma);
  const event = await insertSeatedEvent(prisma, 3);
  for (const seatId of event.seatIds.slice(0, 2)) await services.holdSeat.hold({ holder: holderArg, eventId: event.eventId, seatId });
  const [hold] = await holdRows(prisma, event.eventId);
  return { services, ...event, holdId: hold?.id as string };
}

describe("checkout success and payment failure against PostgreSQL", () => {
  it("sells every seat, confirms the booking, issues one unique code per seat, converts the hold and records the payment", async () => {
    const { services, eventId, seatIds, holdId } = await holdTwo();

    const booking = await services.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "succeed", guestEmail: "Fan@Example.com" });

    expect(booking).toMatchObject({ status: "confirmed", eventId, totalMinor: 10000, currency: "EUR" });
    expect([...booking.seatIds].sort()).toEqual([...seatIds.slice(0, 2)].sort());
    expect(booking.tickets).toHaveLength(2);
    const codes = booking.tickets.map((t) => t.code);
    expect(new Set(codes).size).toBe(2);
    for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    for (const id of seatIds.slice(0, 2)) expect(await seatRow(prisma, id)).toMatchObject({ status: "sold", held_until: null });
    expect((await seatRow(prisma, seatIds[2] as string)).status).toBe("available");
    expect(await bookingRows(prisma, holdId)).toEqual([
      expect.objectContaining({ id: booking.id, status: "confirmed", user_id: null, guest_email: "Fan@Example.com", total_minor: 10000, unit_price_minor: 5000, currency: "EUR" }),
    ]);
    expect((await ticketRows(prisma)).map((t) => t.code).sort()).toEqual([...codes].sort());
    expect((await holdRows(prisma, eventId))[0]?.status).toBe("converted");
    expect(await paymentRows(prisma, holdId)).toEqual([{ hold_id: holdId, idempotency_key: `hold:${holdId}`, amount_minor: 10000, outcome: "succeeded" }]);
  });

  it("checks out a signed-in user without an email and stores the user id", async () => {
    const userId = await insertUser(prisma, "u@example.com");
    const { services, eventId, holdId } = await holdTwo(holderFrom({ userId }));

    await services.checkout.checkout({ holder: holderFrom({ userId }), eventId, paymentOutcome: "succeed" });

    expect(await bookingRows(prisma, holdId)).toEqual([expect.objectContaining({ status: "confirmed", user_id: userId, guest_email: null })]);
  });

  it("leaves the hold and seats intact, records the payment failed and throws PaymentFailed", async () => {
    const { services, eventId, seatIds, holdId } = await holdTwo();

    await expect(services.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "fail", guestEmail: "a@b.de" })).rejects.toBeInstanceOf(PaymentFailed);

    for (const id of seatIds.slice(0, 2)) expect((await seatRow(prisma, id)).status).toBe("held");
    expect((await holdRows(prisma, eventId))[0]?.status).toBe("active");
    expect((await paymentRows(prisma, holdId)).map((p) => p.outcome)).toEqual(["failed"]);
    expect(await bookingRows(prisma, holdId)).toEqual([]);
  });

  it("lets the buyer retry after a failed payment and records the final payment as succeeded", async () => {
    const { services, eventId, holdId } = await holdTwo();
    const base = { holder: visitor(1), eventId, guestEmail: "a@b.de" };
    await expect(services.checkout.checkout({ ...base, paymentOutcome: "fail" })).rejects.toBeInstanceOf(PaymentFailed);

    await services.checkout.checkout({ ...base, paymentOutcome: "succeed" });

    expect((await paymentRows(prisma, holdId)).map((p) => p.outcome)).toEqual(["succeeded"]);
  });

});

describe("checkout validation and hold lookup against PostgreSQL", () => {
  it("rejects a guest checkout without a valid email as a validation error and sells nothing", async () => {
    const { services, eventId, seatIds } = await holdTwo();

    for (const guestEmail of [undefined, "not-an-email"]) {
      await expect(services.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "succeed", guestEmail })).rejects.toBeInstanceOf(ValidationError);
    }
    expect((await seatRow(prisma, seatIds[0] as string)).status).toBe("held");
  });

  it("throws HoldNotFound when the holder has no active hold, and for another holder's hold", async () => {
    const { services, eventId } = await holdTwo();

    await expect(services.checkout.checkout({ holder: visitor(2), eventId, paymentOutcome: "succeed", guestEmail: "a@b.de" })).rejects.toBeInstanceOf(HoldNotFound);
    await expect(services.checkout.checkout({ holder: holderFrom({ userId: await insertUser(prisma, "o@example.com") }), eventId, paymentOutcome: "succeed" })).rejects.toBeInstanceOf(HoldNotFound);
    expect((await holdRows(prisma, eventId))[0]?.status).toBe("active");
  });

  it("throws HoldExpired for an expired hold, without payment and without selling the seats", async () => {
    const clock = new ControlledClock(T0);
    const services = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    await services.holdSeat.hold({ holder: visitor(1), eventId, seatId: seatIds[0] as string });
    clock.advance(10 * 60_000);

    await expect(services.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "succeed", guestEmail: "a@b.de" })).rejects.toBeInstanceOf(HoldExpired);

    expect((await seatRow(prisma, seatIds[0] as string)).status).toBe("held");
    const [{ count }] = await prisma.client.$queryRaw<[{ count: number }]>`SELECT count(*)::int AS count FROM payments`;
    expect(count).toBe(0);
  });
});
