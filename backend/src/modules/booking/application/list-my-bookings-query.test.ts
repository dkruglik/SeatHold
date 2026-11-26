import { describe, expect, it } from "vitest";
import { ListMyBookingsQuery, MY_BOOKINGS_LIMIT } from "./list-my-bookings-query.js";
import type { MyBookingsReader, StoredMyBookings } from "./ports/my-bookings-reader.js";

const booking = (id: string, createdAt: string) => ({
  bookingId: id, createdAt: new Date(createdAt), totalMinor: 9000, currency: "EUR",
  event: { eventId: `e-${id}`, title: "Rock Night", startsAt: new Date("2030-07-01T18:00:00.000Z"), venueName: "Olympia Hall", city: "Berlin", timezone: "Europe/Berlin" },
});
const ticket = (bookingId: string, rowLabel: string, seatNumber: number) => ({ ticketId: `t-${rowLabel}${seatNumber}`, bookingId, code: `c-${rowLabel}${seatNumber}`, rowLabel, seatNumber });

const readerReturning = (stored: StoredMyBookings, calls: { userId: string; limit: number }[] = []): MyBookingsReader => ({
  listConfirmed: (userId, limit) => { calls.push({ userId, limit }); return Promise.resolve(stored); },
});

describe("ListMyBookingsQuery", () => {
  it("asks the reader for that user's bookings with the named limit of 100", async () => {
    const calls: { userId: string; limit: number }[] = [];

    await new ListMyBookingsQuery({ reader: readerReturning({ bookings: [], tickets: [] }, calls) }).execute({ userId: "u1" });

    expect(MY_BOOKINGS_LIMIT).toBe(100);
    expect(calls).toEqual([{ userId: "u1", limit: MY_BOOKINGS_LIMIT }]);
  });

  it("groups tickets under their booking, sorted by row then seat number (row AA after Z, seat 10 after 2), keeping the booking order", async () => {
    const stored: StoredMyBookings = {
      bookings: [booking("b2", "2026-01-02T00:00:00Z"), booking("b1", "2026-01-01T00:00:00Z")],
      tickets: [ticket("b2", "B", 10), ticket("b1", "A", 1), ticket("b2", "AA", 1), ticket("b2", "B", 2), ticket("b2", "Z", 1)],
    };

    const result = await new ListMyBookingsQuery({ reader: readerReturning(stored) }).execute({ userId: "u1" });

    expect(result.map((b) => b.bookingId)).toEqual(["b2", "b1"]);
    expect(result[0]?.tickets.map((t) => `${t.rowLabel}${t.seatNumber}`)).toEqual(["B2", "B10", "Z1", "AA1"]);
    expect(result[1]?.tickets).toEqual([{ ticketId: "t-A1", code: "c-A1", rowLabel: "A", seatNumber: 1 }]);
    expect(result[0]).toMatchObject({ status: "confirmed", totalMinor: 9000, currency: "EUR", event: { eventId: "e-b2", venueName: "Olympia Hall" } });
  });
});
