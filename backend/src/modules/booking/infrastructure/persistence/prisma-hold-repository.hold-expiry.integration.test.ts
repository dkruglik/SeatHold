import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { describe, expect, it } from "vitest";
import { SeatUnavailable } from "../../domain/errors.js";
import { T0, holdRows, insertSeatedEvent, seatRow, useBookingPool, bookingTestServices, visitor } from "./booking-test-support.js";

describe("hold expiry and joining a hold against PostgreSQL", () => {
  const prisma = useBookingPool();
  const clock = new ControlledClock(T0);

  it("adds a second seat to the same hold and keeps the first expires_at", async () => {
    const { holdSeat } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    const holder = visitor("one");
    const first = await holdSeat.hold({ holder, eventId, seatId: seatIds[0] as string });
    clock.advance(3 * 60_000);

    const second = await holdSeat.hold({ holder, eventId, seatId: seatIds[1] as string });

    expect(second.holdId).toBe(first.holdId);
    expect(second.expiresAt).toEqual(new Date(T0.getTime() + 10 * 60_000));
    expect(first.expiresAt).toEqual(second.expiresAt);
    expect((await seatRow(prisma, seatIds[1] as string)).held_until).toEqual(first.expiresAt);
  });

  it("expires the holder's stale hold and frees its seats when the same holder clicks again", async () => {
    const { holdSeat } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    const holder = visitor("late");
    const [s1, s2] = seatIds as [string, string];
    const old = await holdSeat.hold({ holder, eventId, seatId: s1 });
    clock.set(old.expiresAt);

    const fresh = await holdSeat.hold({ holder, eventId, seatId: s2 });

    expect(fresh.holdId).not.toBe(old.holdId);
    expect(fresh.expiresAt).toEqual(new Date(old.expiresAt.getTime() + 10 * 60_000));
    expect(await seatRow(prisma, s1)).toEqual({ status: "available", hold_id: null, held_until: null });
    expect((await seatRow(prisma, s2)).hold_id).toBe(fresh.holdId);
    const statuses = new Map((await holdRows(prisma, eventId)).map((h) => [h.id, h.status]));
    expect(statuses.get(old.holdId)).toBe("expired");
    expect(statuses.get(fresh.holdId)).toBe("active");
  });

  it("lets another visitor take a seat whose hold has expired", async () => {
    const { holdSeat } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    const seatId = seatIds[0] as string;
    const first = await holdSeat.hold({ holder: visitor("a"), eventId, seatId });
    clock.set(new Date(first.expiresAt.getTime() - 1000));
    await expect(holdSeat.hold({ holder: visitor("b"), eventId, seatId })).rejects.toBeInstanceOf(SeatUnavailable);

    clock.set(first.expiresAt);
    const second = await holdSeat.hold({ holder: visitor("b"), eventId, seatId });

    expect((await seatRow(prisma, seatId)).hold_id).toBe(second.holdId);
  });
});
