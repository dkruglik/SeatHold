import { describe, expect, it } from "vitest";
import { AdoptVisitorHoldsService } from "../../application/adopt-visitor-holds-service.js";
import { holderFrom } from "../../domain/holder.js";
import { PrismaHoldRepository } from "./prisma-hold-repository.js";
import { T0, bookingTestServices, insertSeatedEvent, insertUser, seatRow, useBookingPool, visitor } from "./booking-test-support.js";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";

describe("AdoptVisitorHoldsService against PostgreSQL", () => {
  const prisma = useBookingPool();
  const service = (): AdoptVisitorHoldsService => new AdoptVisitorHoldsService({ holds: new PrismaHoldRepository(prisma), clock: new ControlledClock(T0) });
  const columns = (eventId: string) =>
    prisma.client.$queryRaw<{ user_id: string | null; visitor_hash: string | null; status: string }[]>`
      SELECT user_id, visitor_hash, status FROM holds WHERE event_id = ${eventId}::uuid ORDER BY status`;

  it("adopts the active holds of every event of the visitor and is idempotent", async () => {
    const { holdSeat } = bookingTestServices(prisma);
    const a = await insertSeatedEvent(prisma, 1);
    const b = await insertSeatedEvent(prisma, 1);
    const userId = await insertUser(prisma, "ada@example.io");
    await holdSeat.hold({ holder: visitor(1), eventId: a.eventId, seatId: a.seatIds[0] as string });
    await holdSeat.hold({ holder: visitor(1), eventId: b.eventId, seatId: b.seatIds[0] as string });

    await service().adopt({ userId, visitorHash: "visitor-1" });
    await service().adopt({ userId, visitorHash: "visitor-1" });

    expect(await columns(a.eventId)).toEqual([{ user_id: userId, visitor_hash: null, status: "active" }]);
    expect(await columns(b.eventId)).toEqual([{ user_id: userId, visitor_hash: null, status: "active" }]);
  });

  it("does not leave a stale user hold in the way: it expires and the visitor hold is adopted", async () => {
    const { holdSeat } = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    const userId = await insertUser(prisma, "ada@example.io");
    await holdSeat.hold({ holder: holderFrom({ userId }), eventId, seatId: seatIds[0] as string });
    const later = new ControlledClock(T0);
    const visitorHold = bookingTestServices(prisma, 10, later).holdSeat;
    later.set(new Date(T0.getTime() + 11 * 60_000));
    await visitorHold.hold({ holder: visitor(1), eventId, seatId: seatIds[1] as string });

    await new AdoptVisitorHoldsService({ holds: new PrismaHoldRepository(prisma), clock: later }).adopt({ userId, visitorHash: "visitor-1" });

    expect(await columns(eventId)).toEqual([
      { user_id: userId, visitor_hash: null, status: "active" },
      { user_id: userId, visitor_hash: null, status: "expired" },
    ]);
    expect((await seatRow(prisma, seatIds[0] as string)).status).toBe("available");
    expect((await seatRow(prisma, seatIds[1] as string)).status).toBe("held");
  });

});

describe("AdoptVisitorHoldsService against PostgreSQL, concurrent user holds", () => {
  const prisma = useBookingPool();
  const service = (): AdoptVisitorHoldsService => new AdoptVisitorHoldsService({ holds: new PrismaHoldRepository(prisma), clock: new ControlledClock(T0) });
  const columns = (eventId: string) =>
    prisma.client.$queryRaw<{ user_id: string | null; visitor_hash: string | null; status: string }[]>`
      SELECT user_id, visitor_hash, status FROM holds WHERE event_id = ${eventId}::uuid ORDER BY status`;

  it("does not fail when the user creates an active hold concurrently with the adoption", async () => {
    const { holdSeat } = bookingTestServices(prisma);
    const userId = await insertUser(prisma, "ada@example.io");
    for (let round = 0; round < 8; round++) {
      const { eventId, seatIds } = await insertSeatedEvent(prisma, 3);
      await holdSeat.hold({ holder: visitor(round), eventId, seatId: seatIds[0] as string });
      const results = await Promise.allSettled([
        service().adopt({ userId, visitorHash: `visitor-${round}` }),
        holdSeat.hold({ holder: holderFrom({ userId }), eventId, seatId: seatIds[1] as string }),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      const active = (await columns(eventId)).filter((h) => h.status === "active");
      expect(active).toEqual([{ user_id: userId, visitor_hash: null, status: "active" }]);
      const seats = await Promise.all(seatIds.map((id) => seatRow(prisma, id)));
      const holdIds = new Set(seats.filter((s) => s.status === "held").map((s) => s.hold_id));
      expect(holdIds.size).toBe(1);
    }
  });

  it("falls back to releasing when the user's active hold commits while the adoption waits on the unique index", async () => {
    const { holdSeat } = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    const userId = await insertUser(prisma, "ada@example.io");
    await holdSeat.hold({ holder: visitor(1), eventId, seatId: seatIds[0] as string });
    let adoption: Promise<void> = Promise.resolve();

    await prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO holds (event_id, user_id, expires_at, status, created_at)
        VALUES (${eventId}::uuid, ${userId}::uuid, ${new Date(T0.getTime() + 600_000)}, 'active', ${T0})`;
      adoption = service().adopt({ userId, visitorHash: "visitor-1" });
      // The adoption passes its NOT EXISTS check (the insert is uncommitted) and blocks on the unique index until this commits.
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await expect(adoption).resolves.toBeUndefined();
    expect(await columns(eventId)).toEqual([
      { user_id: userId, visitor_hash: null, status: "active" },
      { user_id: null, visitor_hash: "visitor-1", status: "released" },
    ]);
    expect((await seatRow(prisma, seatIds[0] as string)).status).toBe("available");
  });
});
