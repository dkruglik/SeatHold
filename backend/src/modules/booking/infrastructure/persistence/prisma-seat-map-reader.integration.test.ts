import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { EventNotFound } from "../../domain/errors.js";
import { T0, bookingTestServices, insertSeatedEvent, markSold, useBookingPool, visitor } from "./booking-test-support.js";

describe("seat map and current hold reads against PostgreSQL", () => {
  const prisma = useBookingPool();
  const clock = new ControlledClock(T0);

  it("shows expired holds as available, live holds as held and sold seats as sold", async () => {
    const { holdSeat, getSeatMap } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 4);
    const [s1, s2, s3] = seatIds as [string, string, string];
    await holdSeat.hold({ holder: visitor("old"), eventId, seatId: s1 });
    clock.advance(5 * 60_000);
    await holdSeat.hold({ holder: visitor("new"), eventId, seatId: s2 });
    await markSold(prisma, s3);

    clock.advance(5 * 60_000);
    const map = await getSeatMap.execute({ eventId });

    expect(map.seats.map((s) => [s.rowLabel, s.seatNumber, s.state])).toEqual([
      ["A", 1, "available"],
      ["A", 2, "held"],
      ["A", 3, "sold"],
      ["A", 4, "available"],
    ]);
    expect(map.seats.map((s) => s.seatId)).toEqual(seatIds);
    expect(map).toMatchObject({ priceMinor: 5000, currency: "EUR" });
    expect(JSON.stringify(map)).not.toMatch(/hold|visitor/i);
  });

  it("gives two callers byte-identical results", async () => {
    const { holdSeat, getSeatMap } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 3);
    await holdSeat.hold({ holder: visitor("a"), eventId, seatId: seatIds[0] as string });

    const [a, b] = await Promise.all([getSeatMap.execute({ eventId }), getSeatMap.execute({ eventId })]);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("throws EventNotFound for an unknown event", async () => {
    const { getSeatMap } = bookingTestServices(prisma, 10, clock);
    await expect(getSeatMap.execute({ eventId: "00000000-0000-4000-8000-000000000000" })).rejects.toBeInstanceOf(EventNotFound);
  });
});
