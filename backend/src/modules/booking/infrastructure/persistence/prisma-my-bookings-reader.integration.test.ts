import { describe, expect, it } from "vitest";
import { insertSeatedEvent, insertUser, useBookingPool } from "./booking-test-support.js";
import { insertUserBooking } from "./my-bookings-test-support.js";
import { PrismaMyBookingsReader } from "./prisma-my-bookings-reader.js";

describe("PrismaMyBookingsReader", () => {
  const prisma = useBookingPool();
  const reader = new PrismaMyBookingsReader(prisma);

  it("returns only the confirmed bookings of that user, newest first, with their tickets", async () => {
    const mine = await insertUser(prisma, "me@example.io");
    const other = await insertUser(prisma, "other@example.io");
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 5);
    const older = await insertUserBooking(prisma, { userId: mine, eventId, seatIds: [seatIds[0] as string], createdAt: new Date("2026-01-01T10:00:00Z"), codePrefix: "old" });
    const newer = await insertUserBooking(prisma, { userId: mine, eventId, seatIds: [seatIds[1] as string, seatIds[2] as string], createdAt: new Date("2026-01-02T10:00:00Z"), codePrefix: "new" });
    await insertUserBooking(prisma, { userId: mine, eventId, seatIds: [seatIds[3] as string], createdAt: new Date("2026-01-03T10:00:00Z"), status: "rejected", codePrefix: "rej" });
    await insertUserBooking(prisma, { userId: other, eventId, seatIds: [seatIds[4] as string], createdAt: new Date("2026-01-04T10:00:00Z"), codePrefix: "theirs" });

    const stored = await reader.listConfirmed(mine, 100);

    expect(stored.bookings.map((b) => b.bookingId)).toEqual([newer.bookingId, older.bookingId]);
    expect(stored.bookings[0]).toMatchObject({ totalMinor: 10000, currency: "EUR", event: { eventId, title: "Show", city: "Berlin", timezone: "Europe/Berlin" } });
    expect(stored.tickets.map((t) => t.code).sort()).toEqual(["new-0", "new-1", "old-0"]);
  });

  it("keeps only the latest `limit` bookings, and reads with two statements at most", async () => {
    const mine = await insertUser(prisma, "me@example.io");
    const { eventId, seatIds } = await insertSeatedEvent(prisma, 3);
    const made = [];
    for (const [i, seatId] of seatIds.entries()) {
      made.push(await insertUserBooking(prisma, { userId: mine, eventId, seatIds: [seatId], createdAt: new Date(`2026-01-0${i + 1}T10:00:00Z`), codePrefix: `b${i}` }));
    }

    const stored = await reader.listConfirmed(mine, 2);

    expect(stored.bookings.map((b) => b.bookingId)).toEqual([made[2]?.bookingId, made[1]?.bookingId]);
    expect(stored.tickets.map((t) => t.code).sort()).toEqual(["b1-0", "b2-0"]);
  });

  it("returns nothing, without a ticket query, for a user without bookings", async () => {
    const stored = await reader.listConfirmed(await insertUser(prisma, "me@example.io"), 100);

    expect(stored).toEqual({ bookings: [], tickets: [] });
  });
});
