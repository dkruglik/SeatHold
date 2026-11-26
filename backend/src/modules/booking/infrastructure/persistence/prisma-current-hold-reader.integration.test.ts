import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { HoldNotFound } from "../../domain/errors.js";
import { T0, bookingTestServices, insertSeatedEvent, useBookingPool, visitor } from "./booking-test-support.js";

describe("current hold query against PostgreSQL", () => {
  const prisma = useBookingPool();
  const clock = new ControlledClock(T0);

  it("returns the holder's seats and expiresAt, and not another holder's hold", async () => {
    const { holdSeat, getCurrentHold } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 3);
    const [s1, s2, s3] = seatIds as [string, string, string];
    const mine = await holdSeat.hold({ holder: visitor("me"), eventId, seatId: s1 });
    await holdSeat.hold({ holder: visitor("me"), eventId, seatId: s2 });
    await holdSeat.hold({ holder: visitor("other"), eventId, seatId: s3 });

    const result = await getCurrentHold.execute({ holder: visitor("me"), eventId });

    expect(result.holdId).toBe(mine.holdId);
    expect(result.expiresAt).toEqual(mine.expiresAt);
    expect([...result.seatIds].sort()).toEqual([s1, s2].sort());
    await expect(getCurrentHold.execute({ holder: visitor("nobody"), eventId })).rejects.toBeInstanceOf(HoldNotFound);
  });

  it("is HoldNotFound at exactly expires_at and still there one second before", async () => {
    const { holdSeat, getCurrentHold } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    const hold = await holdSeat.hold({ holder: visitor("me"), eventId, seatId: seatIds[0] as string });

    clock.set(new Date(hold.expiresAt.getTime() - 1000));
    await expect(getCurrentHold.execute({ holder: visitor("me"), eventId })).resolves.toMatchObject({ holdId: hold.holdId });

    clock.set(hold.expiresAt);
    await expect(getCurrentHold.execute({ holder: visitor("me"), eventId })).rejects.toBeInstanceOf(HoldNotFound);
  });
});
