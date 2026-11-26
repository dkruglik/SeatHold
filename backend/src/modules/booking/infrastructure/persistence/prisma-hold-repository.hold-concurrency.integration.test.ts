import { describe, expect, it } from "vitest";
import { SeatUnavailable } from "../../domain/errors.js";
import { holdRows, insertSeatedEvent, markSold, seatRow, useBookingPool, bookingTestServices, visitor } from "./booking-test-support.js";

describe("hold: concurrency, cap and sold seats against PostgreSQL", () => {
  const prisma = useBookingPool();

  it("lets exactly one of 100 parallel visitors hold one seat and points the seat at the winner's hold", async () => {
    const { holdSeat } = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    const seatId = seatIds[0] as string;

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, i) => holdSeat.hold({ holder: visitor(i), eventId, seatId })),
    );

    const winners = results.filter((r) => r.status === "fulfilled");
    const losers = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect([winners.length, losers.length]).toEqual([1, 99]);
    expect(losers.every((r) => r.reason instanceof SeatUnavailable)).toBe(true);
    const winningHoldId = (winners[0] as PromiseFulfilledResult<{ holdId: string }>).value.holdId;
    const seat = await seatRow(prisma, seatId);
    expect(seat.status).toBe("held");
    expect(seat.hold_id).toBe(winningHoldId);
    const holds = await holdRows(prisma, eventId);
    expect(holds.map((h) => h.id)).toEqual([winningHoldId]);
  });

  it("does not hold a sold seat and leaves no empty hold behind", async () => {
    const { holdSeat } = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    await markSold(prisma, seatIds[0] as string);

    await expect(holdSeat.hold({ holder: visitor(1), eventId, seatId: seatIds[0] as string })).rejects.toBeInstanceOf(SeatUnavailable);

    expect(await holdRows(prisma, eventId)).toEqual([]);
  });

  it("keeps one hold with both seats when one holder clicks two seats in parallel", async () => {
    const { holdSeat } = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    const holder = visitor("same");

    const [a, b] = await Promise.all(seatIds.map((seatId) => holdSeat.hold({ holder, eventId, seatId })));

    const holds = await holdRows(prisma, eventId);
    expect(holds).toHaveLength(1);
    expect(holds[0]?.status).toBe("active");
    expect(a?.holdId).toBe(holds[0]?.id);
    expect(b?.holdId).toBe(holds[0]?.id);
    for (const id of seatIds) expect((await seatRow(prisma, id)).hold_id).toBe(holds[0]?.id);
  });
});
