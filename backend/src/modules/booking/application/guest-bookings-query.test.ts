import { describe, expect, it } from "vitest";
import { GuestBookingsQuery } from "./guest-bookings-query.js";
import type { GuestBookingReader } from "./ports/guest-booking-reader.js";

const stored = { bookingId: "b1", createdAt: new Date(0), totalMinor: 1, currency: "EUR", event: { eventId: "e", title: "T", startsAt: new Date(1), venueName: "V", city: "C", timezone: "UTC" } };
const reader: GuestBookingReader = {
  findConfirmed: (id) => Promise.resolve(id === "b1" ? stored : null),
  findTickets: () => Promise.resolve([
    { ticketId: "t3", bookingId: "b1", code: "c3", rowLabel: "B", seatNumber: 1 },
    { ticketId: "t2", bookingId: "b1", code: "c2", rowLabel: "A", seatNumber: 10 },
    { ticketId: "t1", bookingId: "b1", code: "c1", rowLabel: "A", seatNumber: 2 },
  ]),
  listUpcomingConfirmedByEmail: () => Promise.resolve([stored]),
};

describe("GuestBookingsQuery", () => {
  const query = new GuestBookingsQuery({ reader });

  it("returns the confirmed booking with tickets ordered by seat, in the my-bookings shape", async () => {
    const result = await query.getConfirmedBookingWithTickets("b1");

    expect(result?.status).toBe("confirmed");
    expect(result?.tickets.map((t) => t.ticketId)).toEqual(["t1", "t2", "t3"]);
    expect(result?.tickets[0]).toEqual({ ticketId: "t1", code: "c1", rowLabel: "A", seatNumber: 2 });
  });

  it("returns null for an unknown or non-guest booking", async () => {
    expect(await query.getConfirmedBookingWithTickets("x")).toBeNull();
    expect(await query.findConfirmedGuestBooking("x")).toBeNull();
  });

  it("passes the email and now through for the upcoming lookup", async () => {
    expect(await query.findUpcomingConfirmedGuestBookingsByEmail("a@b.de", new Date(0))).toEqual([stored]);
  });
});
