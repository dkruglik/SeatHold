import { describe, expect, it } from "vitest";
import { ControlledClock } from "../shared/time/controlled-clock.js";
import { T0, bookingTestServices, holdRows, insertSeatedEvent, markSold, seatRow, useBookingPool, visitor } from "../modules/booking/infrastructure/persistence/booking-test-support.js";
import { runSweepHoldsCommand } from "./sweep-holds-command.js";

describe("the sweep:holds command on the database", () => {
  const prisma = useBookingPool();
  const clock = new ControlledClock(T0);

  it("frees expired holds, leaves live holds and sold seats alone, and a second run frees nothing", async () => {
    const { holdSeat, expireHolds } = bookingTestServices(prisma, 10, clock);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 3);
    const [expired, live, sold] = seatIds as [string, string, string];
    const old = await holdSeat.hold({ holder: visitor("old"), eventId, seatId: expired });
    clock.advance(5 * 60_000);
    const fresh = await holdSeat.hold({ holder: visitor("new"), eventId, seatId: live });
    await markSold(prisma, sold);
    clock.set(old.expiresAt);
    const out: string[] = [];
    const err: string[] = [];
    const run = (argv: string[]) => runSweepHoldsCommand(argv, { sweeper: expireHolds, io: { out: (l) => out.push(l), err: (l) => err.push(l) } });

    expect(await run(["--batch-size=1"])).toBe(0);
    expect(await run([])).toBe(0);

    expect(out).toEqual(["holds swept freedSeats=1 expiredHolds=1", "holds swept freedSeats=0 expiredHolds=0"]);
    expect(err).toEqual([]);
    expect(await seatRow(prisma, expired)).toEqual({ status: "available", hold_id: null, held_until: null });
    expect((await seatRow(prisma, live)).hold_id).toBe(fresh.holdId);
    expect((await seatRow(prisma, sold)).status).toBe("sold");
    const statuses = new Map((await holdRows(prisma, eventId)).map((h) => [h.id, h.status]));
    expect([statuses.get(old.holdId), statuses.get(fresh.holdId)]).toEqual(["expired", "active"]);
  });
});
