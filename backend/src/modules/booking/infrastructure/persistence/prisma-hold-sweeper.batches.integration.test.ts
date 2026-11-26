import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { T0, bookingTestServices, insertSeatedEvent, seatRow, useBookingPool, visitor } from "./booking-test-support.js";

describe("expired hold sweeper batches and concurrency against PostgreSQL", () => {
  const prisma = useBookingPool();
  const clock = new ControlledClock(T0);

  async function holdMany(count: number) {
    const services = bookingTestServices(prisma, 25, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, count);
    for (const seatId of seatIds) await services.holdSeat.hold({ holder: visitor("many"), eventId, seatId });
    clock.advance(11 * 60_000);
    return { services, eventId, seatIds };
  }

  it("frees 25 expired seats with batch size 10 in one sweep call", async () => {
    const { services, seatIds } = await holdMany(25);

    const result = await services.expireHolds.sweep({ batchSize: 10 });

    expect(result).toEqual({ freedSeats: 25, expiredHolds: 1 });
    for (const seatId of seatIds) expect((await seatRow(prisma, seatId)).status).toBe("available");
  });

  it("lets two concurrent sweeps run without errors or double counting", async () => {
    const { services, seatIds } = await holdMany(25);

    const [a, b] = await Promise.all([services.expireHolds.sweep({ batchSize: 10 }), services.expireHolds.sweep({ batchSize: 10 })]);
    const rest = await services.expireHolds.sweep({ batchSize: 10 });

    expect(a.freedSeats + b.freedSeats + rest.freedSeats).toBe(25);
    for (const seatId of seatIds) expect((await seatRow(prisma, seatId)).status).toBe("available");
  });
});
