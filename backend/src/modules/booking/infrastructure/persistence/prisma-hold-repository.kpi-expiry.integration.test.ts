import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { SeatUnavailable } from "../../domain/errors.js";
import { T0, bookingTestServices, insertSeatedEvent, seatRow, useBookingPool, visitor } from "./booking-test-support.js";

const HOLD_MS = 10 * 60_000;

describe("required KPI: a hold expires after HOLD_DURATION_MINUTES without real waiting", () => {
  const prisma = useBookingPool();

  it.each([1, 2])("another visitor holds the seat 1 second after the duration (run %i, same result every time)", async () => {
    const clock = new ControlledClock(T0);
    const { holdSeat } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    const seatId = seatIds[0] as string;
    const first = await holdSeat.hold({ holder: visitor("a"), eventId, seatId });
    expect(first.expiresAt).toEqual(new Date(T0.getTime() + HOLD_MS));

    clock.set(new Date(T0.getTime() + HOLD_MS + 1000));
    const second = await holdSeat.hold({ holder: visitor("b"), eventId, seatId });

    expect(second.holdId).not.toBe(first.holdId);
    expect((await seatRow(prisma, seatId)).hold_id).toBe(second.holdId);
  });

  it("keeps the seat held at expires_at minus 1 second and frees it at exactly expires_at", async () => {
    const clock = new ControlledClock(T0);
    const { holdSeat } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    const seatId = seatIds[0] as string;
    const first = await holdSeat.hold({ holder: visitor("a"), eventId, seatId });

    clock.set(new Date(first.expiresAt.getTime() - 1000));
    await expect(holdSeat.hold({ holder: visitor("b"), eventId, seatId })).rejects.toBeInstanceOf(SeatUnavailable);
    expect((await seatRow(prisma, seatId)).hold_id).toBe(first.holdId);

    clock.set(first.expiresAt);
    await expect(holdSeat.hold({ holder: visitor("b"), eventId, seatId })).resolves.toBeDefined();
  });
});
