import { describe, expect, it } from "vitest";
import { PrismaUserRepository } from "../../../auth/index.js";
import { cookieHeader, sidOf, T0, useAuthApp } from "../../../auth/presentation/http/auth-route-test-support.js";
import { holdSeat, seedBooking, seedEvent } from "./admin-read-test-support.js";

const harness = useAuthApp();
const adminHeaders = async (): Promise<Record<string, string>> => {
  const sid = sidOf(await harness.login("admin@example.io"));
  await new PrismaUserRepository(harness.prisma).setRoleByEmail("admin@example.io", "admin");
  return cookieHeader(sid);
};
const minutes = (n: number): Date => new Date(T0.getTime() + n * 60_000);

describe("GET /api/admin/events", () => {
  it("counts sold, held and available per event with lazy expiry, and answers no-store", async () => {
    const event = await seedEvent(harness.prisma, { title: "Counted", seats: [["A", 1], ["A", 2], ["A", 3], ["A", 4], ["A", 5]] });
    await holdSeat(harness.prisma, event.eventId, event.seat.A1 ?? "", minutes(5)); // live
    await holdSeat(harness.prisma, event.eventId, event.seat.A2 ?? "", minutes(-5)); // expired -> available
    await holdSeat(harness.prisma, event.eventId, event.seat.A3 ?? "", T0); // ends exactly now -> available
    await seedBooking(harness.prisma, { eventId: event.eventId, seatIds: [event.seat.A4 ?? ""], guestEmail: "g@example.io", createdAt: minutes(-60) });

    const response = await harness.get("/api/admin/events", await adminHeaders());

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      items: [{
        eventId: event.eventId, showTitle: "Counted", venueName: expect.any(String), city: "Berlin", startsAt: "2030-06-01T18:00:00.000Z",
        priceMinor: 5000, currency: "EUR", rows: 2, seatsPerRow: 2, seatCount: 4, sold: 1, held: 1, available: 3,
      }],
      total: 1, page: 1, pageSize: 20, totalPages: 1,
    });
  });

  it("lists past and upcoming events, newest start first, and pages without gaps or repeats", async () => {
    const titles = ["Past", "Soon", "Later"];
    const starts = [new Date("2029-01-01T10:00:00Z"), new Date("2030-02-01T10:00:00Z"), new Date("2030-03-01T10:00:00Z")];
    for (const [i, title] of titles.entries()) await seedEvent(harness.prisma, { title, startsAt: starts[i] as Date, seats: [["A", 1]] });
    const headers = await adminHeaders();

    const first = (await harness.get("/api/admin/events?page=1&pageSize=2", headers)).json() as { items: { showTitle: string }[]; total: number; totalPages: number };
    const second = (await harness.get("/api/admin/events?page=2&pageSize=2", headers)).json() as { items: { showTitle: string }[] };

    expect(first.items.map((i) => i.showTitle)).toEqual(["Later", "Soon"]);
    expect(second.items.map((i) => i.showTitle)).toEqual(["Past"]);
    expect([first.total, first.totalPages]).toEqual([3, 2]);
  });

  it("shows zero counts for an event with no seats", async () => {
    await seedEvent(harness.prisma, { seats: [] });

    const body = (await harness.get("/api/admin/events", await adminHeaders())).json() as { items: { sold: number; held: number; available: number }[] };

    expect(body.items[0]).toMatchObject({ sold: 0, held: 0, available: 0 });
  });

  it.each(["pageSize=101", "pageSize=0", "page=0", "page=x", "extra=1"])("rejects %s with 400", async (query) => {
    expect((await harness.get(`/api/admin/events?${query}`, await adminHeaders())).statusCode).toBe(400);
  });
});

describe("GET /api/admin/lookups", () => {
  it("returns shows and venues sorted by title and name", async () => {
    await harness.prisma.client.$executeRawUnsafe(`
      INSERT INTO shows (title, type, genre, description) VALUES ('Zed', 'concert', 'rock', 'd'), ('Alpha', 'theatre', 'drama', 'd');
      INSERT INTO venues (name, city, country_code, timezone) VALUES ('Dome', 'Paris', 'FR', 'Europe/Paris'), ('Arena', 'Berlin', 'DE', 'Europe/Berlin')`);

    const response = await harness.get("/api/admin/lookups", await adminHeaders());

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      shows: [{ id: expect.any(String), title: "Alpha", type: "theatre", genre: "drama" }, { id: expect.any(String), title: "Zed", type: "concert", genre: "rock" }],
      venues: [
        { id: expect.any(String), name: "Arena", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
        { id: expect.any(String), name: "Dome", city: "Paris", countryCode: "FR", timezone: "Europe/Paris" },
      ],
    });
  });

  it("returns empty lists when there is nothing yet", async () => {
    expect((await harness.get("/api/admin/lookups", await adminHeaders())).json()).toEqual({ shows: [], venues: [] });
  });
});
