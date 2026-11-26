import { describe, expect, it } from "vitest";
import { HoldNotFound } from "../../domain/errors.js";
import { holderFrom } from "../../domain/holder.js";
import { holdRows, insertSeatedEvent, insertUser, seatRow, useBookingPool, bookingTestServices, visitor } from "./booking-test-support.js";

describe("release against PostgreSQL", () => {
  const prisma = useBookingPool();

  it("releases only the holder's own seat and marks the hold released when it is empty", async () => {
    const { holdSeat, releaseSeat } = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    const mine = visitor("mine");
    const other = visitor("other");
    const [s1, s2] = seatIds as [string, string];
    await holdSeat.hold({ holder: mine, eventId, seatId: s1 });
    await holdSeat.hold({ holder: other, eventId, seatId: s2 });

    await expect(releaseSeat.release({ holder: other, eventId, seatId: s1 })).rejects.toBeInstanceOf(HoldNotFound);
    expect((await seatRow(prisma, s1)).status).toBe("held");

    await releaseSeat.release({ holder: mine, eventId, seatId: s1 });
    const freed = await seatRow(prisma, s1);
    expect(freed).toEqual({ status: "available", hold_id: null, held_until: null });
    expect((await seatRow(prisma, s2)).status).toBe("held");
    const statuses = (await holdRows(prisma, eventId)).map((h) => h.status).sort();
    expect(statuses).toEqual(["active", "released"]);
    await expect(releaseSeat.release({ holder: mine, eventId, seatId: s1 })).rejects.toBeInstanceOf(HoldNotFound);
  });

  it("keeps the hold active when a seat is released and others remain", async () => {
    const { holdSeat, releaseSeat } = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 2);
    const holder = visitor("two");
    for (const seatId of seatIds) await holdSeat.hold({ holder, eventId, seatId });

    await releaseSeat.release({ holder, eventId, seatId: seatIds[0] as string });

    expect((await holdRows(prisma, eventId)).map((h) => h.status)).toEqual(["active"]);
  });

  it("works for a signed-in user holder as for a visitor", async () => {
    const { holdSeat, releaseSeat } = bookingTestServices(prisma);
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 1);
    const userId = await insertUser(prisma, "u@x.io");
    const holder = holderFrom({ userId });

    const held = await holdSeat.hold({ holder, eventId, seatId: seatIds[0] as string });

    const rows = await prisma.client.$queryRaw<{ user_id: string | null; visitor_hash: string | null }[]>`
      SELECT user_id, visitor_hash FROM holds WHERE id = ${held.holdId}::uuid`;
    expect(rows).toEqual([{ user_id: userId, visitor_hash: null }]);
    await releaseSeat.release({ holder, eventId, seatId: seatIds[0] as string });
    expect((await seatRow(prisma, seatIds[0] as string)).status).toBe("available");
  });
});
