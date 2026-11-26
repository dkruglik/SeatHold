import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { T0, bookingTestServices, holdRows, insertSeatedEvent, markSold, seatRow, useBookingPool, visitor } from "./booking-test-support.js";

describe("expired hold sweeper against PostgreSQL", () => {
  const prisma = useBookingPool();
  const clock = new ControlledClock(T0);

  it("frees only expired seats, leaves live holds and sold seats alone, and is idempotent", async () => {
    const { holdSeat, expireHolds } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 3);
    const [expired, live, sold] = seatIds as [string, string, string];
    const old = await holdSeat.hold({ holder: visitor("old"), eventId, seatId: expired });
    clock.advance(5 * 60_000);
    const fresh = await holdSeat.hold({ holder: visitor("new"), eventId, seatId: live });
    await markSold(prisma, sold);
    clock.set(old.expiresAt);

    const first = await expireHolds.sweep({ batchSize: 10 });
    const second = await expireHolds.sweep({ batchSize: 10 });

    expect(first).toEqual({ freedSeats: 1, expiredHolds: 1 });
    expect(second).toEqual({ freedSeats: 0, expiredHolds: 0 });
    expect(await seatRow(prisma, expired)).toEqual({ status: "available", hold_id: null, held_until: null });
    expect((await seatRow(prisma, live)).hold_id).toBe(fresh.holdId);
    expect((await seatRow(prisma, sold)).status).toBe("sold");
    const statuses = new Map((await holdRows(prisma, eventId)).map((h) => [h.id, h.status]));
    expect(statuses.get(old.holdId)).toBe("expired");
    expect(statuses.get(fresh.holdId)).toBe("active");
  });

  it("does not touch a seat at expires_at minus 1 second", async () => {
    const { holdSeat, expireHolds } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    const hold = await holdSeat.hold({ holder: visitor("a"), eventId, seatId: seatIds[0] as string });
    clock.set(new Date(hold.expiresAt.getTime() - 1000));

    expect(await expireHolds.sweep({ batchSize: 10 })).toEqual({ freedSeats: 0, expiredHolds: 0 });
  });
});
