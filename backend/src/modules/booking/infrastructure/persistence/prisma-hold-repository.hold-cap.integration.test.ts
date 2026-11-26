import { describe, expect, it } from "vitest";
import { HoldLimitReached } from "../../domain/errors.js";
import { insertSeatedEvent, seatRow, useBookingPool, bookingTestServices, visitor } from "./booking-test-support.js";

describe("hold seat cap against PostgreSQL", () => {
  const prisma = useBookingPool();

  it("returns HoldLimitReached at the seat cap, also under parallel clicks", async () => {
    const { holdSeat } = bookingTestServices(prisma, 2);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 4);
    const holder = visitor("greedy");

    const results = await Promise.allSettled(seatIds.map((seatId) => holdSeat.hold({ holder, eventId, seatId })));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.reason instanceof HoldLimitReached)).toBe(true);
    const held = await Promise.all(seatIds.map((id) => seatRow(prisma, id)));
    expect(held.filter((s) => s.status === "held")).toHaveLength(2);
  });
});
