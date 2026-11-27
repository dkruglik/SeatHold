import { describe, expect, it } from "vitest";
import { useAuthDatabase } from "../../../auth/infrastructure/persistence/auth-test-support.js";
import { holdSeat, releaseLogRows, seatState, seedEvent } from "../../presentation/http/admin-read-test-support.js";
import { PrismaSeatReleaser } from "./prisma-seat-releaser.js";

const NOW = new Date("2030-01-01T10:00:00.000Z");

describe("PrismaSeatReleaser", () => {
  const prisma = useAuthDatabase();

  it("rolls the seat release back when the log insert fails, leaving the seat held and the hold active", async () => {
    await prisma.client.$executeRawUnsafe("TRUNCATE TABLE payments, tickets, bookings, seats, holds, events, shows, venues CASCADE");
    const { eventId, seat } = await seedEvent(prisma, { seats: [["A", 1]] });
    await holdSeat(prisma, eventId, seat.A1 as string, new Date("2030-01-01T10:10:00Z"));
    const before = await seatState(prisma, seat.A1 as string);
    const missingAdmin = "0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11";

    await expect(new PrismaSeatReleaser(prisma).release({ eventId, seatId: seat.A1 as string, adminUserId: missingAdmin, reason: "valid reason", now: NOW })).rejects.toThrow();

    expect(await seatState(prisma, seat.A1 as string)).toEqual(before);
    expect(before.status).toBe("held");
    const holds = await prisma.client.$queryRaw<{ status: string }[]>`SELECT status FROM holds WHERE id = ${before.hold_id}::uuid`;
    expect(holds).toEqual([{ status: "active" }]);
    expect(await releaseLogRows(prisma)).toEqual([]);
  });
});
