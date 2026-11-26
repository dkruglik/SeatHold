import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { HoldExpired, HoldNotFound } from "../../domain/errors.js";
import { bookingTestServices, holdRows, insertSeatedEvent, seatRow, T0, useBookingPool, visitor } from "./booking-test-support.js";
import { barrier, bookingRows, HookedGateway, insertForeignTicket, paymentRows, ticketRows } from "./checkout-test-support.js";

const prisma = useBookingPool();
const guest = (eventId: string) => ({ holder: visitor(1), eventId, paymentOutcome: "succeed" as const, guestEmail: "a@b.de" });

describe("late payment and concurrent checkout against PostgreSQL", () => {
  it("rejects a late payment: booking rejected, payment voided, the other holder's seat untouched, no tickets", async () => {
    const clock = new ControlledClock(T0);
    const retake: { run: () => Promise<void> } = { run: () => Promise.resolve() };
    const services = bookingTestServices(prisma, 10, clock, new HookedGateway(() => retake.run()));
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    for (const seatId of seatIds) await services.holdSeat.hold({ holder: visitor(1), eventId, seatId });
    // While the payment is authorized the hold expires and another visitor takes the first seat.
    retake.run = async () => {
      clock.advance(11 * 60_000);
      await services.holdSeat.hold({ holder: visitor(2), eventId, seatId: seatIds[0] as string });
    };

    await expect(services.checkout.checkout(guest(eventId))).rejects.toBeInstanceOf(HoldExpired);

    const holds = await holdRows(prisma, eventId);
    const mine = holds.find((h) => h.status === "expired");
    const theirs = holds.find((h) => h.status === "active");
    expect(mine && theirs).toBeTruthy();
    expect(await bookingRows(prisma, mine?.id as string)).toEqual([expect.objectContaining({ status: "rejected" })]);
    expect((await paymentRows(prisma, mine?.id as string)).map((p) => p.outcome)).toEqual(["voided"]);
    expect(await seatRow(prisma, seatIds[0] as string)).toMatchObject({ status: "held", hold_id: theirs?.id });
    expect(await seatRow(prisma, seatIds[1] as string)).toMatchObject({ status: "available", hold_id: null });
    expect(await ticketRows(prisma)).toEqual([]);
  });

  it("rejects a payment that finishes after the hold expired even when nobody retook the seat", async () => {
    const clock = new ControlledClock(T0);
    const services = bookingTestServices(prisma, 10, clock, new HookedGateway(() => { clock.advance(11 * 60_000); return Promise.resolve(); }));
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    for (const seatId of seatIds) await services.holdSeat.hold({ holder: visitor(1), eventId, seatId });
    const [hold] = await holdRows(prisma, eventId);

    await expect(services.checkout.checkout(guest(eventId))).rejects.toBeInstanceOf(HoldExpired);

    expect(await bookingRows(prisma, hold?.id as string)).toEqual([expect.objectContaining({ status: "rejected" })]);
    expect((await paymentRows(prisma, hold?.id as string)).map((p) => p.outcome)).toEqual(["voided"]);
    for (const id of seatIds) expect((await seatRow(prisma, id)).status).not.toBe("sold");
    expect(await ticketRows(prisma)).toEqual([]);
  });

  it("creates exactly one booking and one set of tickets for two concurrent checkouts of one hold", async () => {
    const services = bookingTestServices(prisma, 10, new ControlledClock(T0), new HookedGateway(barrier(2)));
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    for (const seatId of seatIds) await services.holdSeat.hold({ holder: visitor(1), eventId, seatId });

    const results = await Promise.allSettled([services.checkout.checkout(guest(eventId)), services.checkout.checkout(guest(eventId))]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect([fulfilled.length, rejected.length]).toEqual([1, 1]);
    expect(rejected[0]?.reason).toBeInstanceOf(HoldNotFound);
    const [hold] = await holdRows(prisma, eventId);
    expect(await bookingRows(prisma, hold?.id as string)).toHaveLength(1);
    expect(await ticketRows(prisma)).toHaveLength(2);
    expect((await paymentRows(prisma, hold?.id as string)).map((p) => p.outcome)).toEqual(["succeeded"]);
  });

});

describe("hold gone after authorize against PostgreSQL", () => {
  it("records the authorized payment as voided and throws HoldNotFound when the hold is released before confirm", async () => {
    const release: { run: () => Promise<void> } = { run: () => Promise.resolve() };
    const services = bookingTestServices(prisma, 10, new ControlledClock(T0), new HookedGateway(() => release.run()));
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    for (const seatId of seatIds) await services.holdSeat.hold({ holder: visitor(1), eventId, seatId });
    const [hold] = await holdRows(prisma, eventId);
    release.run = async () => {
      for (const seatId of seatIds) await services.releaseSeat.release({ holder: visitor(1), eventId, seatId });
    };

    await expect(services.checkout.checkout(guest(eventId))).rejects.toBeInstanceOf(HoldNotFound);

    expect(await paymentRows(prisma, hold?.id as string)).toEqual([
      { hold_id: hold?.id, idempotency_key: `hold:${hold?.id}`, amount_minor: 10000, outcome: "voided" },
    ]);
    expect(await bookingRows(prisma, hold?.id as string)).toEqual([]);
    expect(await ticketRows(prisma)).toEqual([]);
  });
});

describe("ticket backstop against PostgreSQL", () => {
  it("maps a ticket for an already-ticketed seat (UNIQUE seat_id) to HoldExpired and rolls everything back", async () => {
    const services = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    for (const seatId of seatIds) await services.holdSeat.hold({ holder: visitor(1), eventId, seatId });
    const mine = (await holdRows(prisma, eventId))[0];
    await insertForeignTicket(prisma, eventId, seatIds[1] as string);

    await expect(services.checkout.checkout(guest(eventId))).rejects.toBeInstanceOf(HoldExpired);

    for (const id of seatIds) expect(await seatRow(prisma, id)).toMatchObject({ status: "held", hold_id: mine?.id });
    expect(await bookingRows(prisma, mine?.id as string)).toEqual([]);
    expect((await ticketRows(prisma)).map((t) => t.code)).toEqual(["forced-code"]);
    expect((await holdRows(prisma, eventId)).find((h) => h.id === mine?.id)?.status).toBe("active");
    expect((await paymentRows(prisma, mine?.id as string)).map((p) => p.outcome)).toEqual(["voided"]);
  });
});
