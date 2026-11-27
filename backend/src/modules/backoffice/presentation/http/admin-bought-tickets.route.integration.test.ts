import { describe, expect, it } from "vitest";
import { PrismaUserRepository } from "../../../auth/index.js";
import { cookieHeader, sidOf, T0, useAuthApp } from "../../../auth/presentation/http/auth-route-test-support.js";
import { seedBooking, seedEvent } from "./admin-read-test-support.js";

const harness = useAuthApp();
const adminHeaders = async (): Promise<Record<string, string>> => {
  const sid = sidOf(await harness.login("admin@example.io"));
  await new PrismaUserRepository(harness.prisma).setRoleByEmail("admin@example.io", "admin");
  return cookieHeader(sid);
};
const minutes = (n: number): Date => new Date(T0.getTime() + n * 60_000);

interface BoughtBody {
  event: { eventId: string; showTitle: string; startsAt: string; venueName: string; city: string; timezone: string };
  items: Record<string, unknown>[];
  total: number; page: number; pageSize: number; totalPages: number;
}
const bought = async (eventId: string, query = ""): Promise<BoughtBody> => (await harness.get(`/api/admin/events/${eventId}/bought-tickets${query}`, await adminHeaders())).json() as BoughtBody;

describe("GET /api/admin/events/:eventId/bought-tickets", () => {
  it("shows one row per ticket with the user's or the guest's email, oldest booking first, rejected bookings excluded", async () => {
    const event = await seedEvent(harness.prisma, { title: "Sold show", seats: [["A", 1], ["A", 2], ["A", 3], ["A", 4]] });
    await seedBooking(harness.prisma, { eventId: event.eventId, seatIds: [event.seat.A3 ?? ""], guestEmail: "guest@example.io", createdAt: minutes(-30) });
    await seedBooking(harness.prisma, { eventId: event.eventId, seatIds: [event.seat.A1 ?? "", event.seat.A2 ?? ""], userEmail: "ada@example.io", createdAt: minutes(-60) });
    await seedBooking(harness.prisma, { eventId: event.eventId, seatIds: [event.seat.A4 ?? ""], guestEmail: "rejected@example.io", status: "rejected", createdAt: minutes(-10) });

    const response = await harness.get(`/api/admin/events/${event.eventId}/bought-tickets`, await adminHeaders());
    const body = response.json() as BoughtBody;

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(body.event).toEqual({
      eventId: event.eventId, showTitle: "Sold show", startsAt: "2030-06-01T18:00:00.000Z", venueName: expect.stringMatching(/^Hall /), city: "Berlin", timezone: "Europe/Berlin",
    });
    expect(body.items.map((i) => [i.row, i.number, i.buyerEmail, i.buyerType])).toEqual([
      ["A", 1, "ada@example.io", "user"], ["A", 2, "ada@example.io", "user"], ["A", 3, "guest@example.io", "guest"],
    ]);
    expect(body.items[0]).toMatchObject({ bookedAt: minutes(-60).toISOString(), bookingStatus: "confirmed" });
    expect(body.items[2]).toMatchObject({ bookedAt: minutes(-30).toISOString() });
    expect([body.total, body.page, body.pageSize, body.totalPages]).toEqual([3, 1, 50, 1]);
  });

  it("exposes only the documented fields: no ticket code, no payment data", async () => {
    const event = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    await seedBooking(harness.prisma, { eventId: event.eventId, seatIds: [event.seat.A1 ?? ""], guestEmail: "g@example.io", createdAt: minutes(-5) });

    const body = await bought(event.eventId);

    expect(Object.keys(body.items[0] ?? {}).sort()).toEqual(["bookedAt", "bookingStatus", "buyerEmail", "buyerType", "number", "row", "ticketId"]);
    expect(JSON.stringify(body)).not.toMatch(/CODE-|amount|total_minor|totalMinor|payment/i);
  });

  it("pages without gaps or repeats", async () => {
    const event = await seedEvent(harness.prisma, { seats: [["A", 1], ["A", 2], ["A", 3]] });
    for (const [i, n] of [1, 2, 3].entries()) await seedBooking(harness.prisma, { eventId: event.eventId, seatIds: [event.seat[`A${n}`] ?? ""], guestEmail: `g${n}@example.io`, createdAt: minutes(-30 + i) });

    const one = await bought(event.eventId, "?page=1&pageSize=2");
    const two = await bought(event.eventId, "?page=2&pageSize=2");

    expect([...one.items, ...two.items].map((i) => i.buyerEmail)).toEqual(["g1@example.io", "g2@example.io", "g3@example.io"]);
    expect(one).toMatchObject({ total: 3, totalPages: 2 });
  });

  it("answers 404 for an unknown event and 400 for a malformed id or a page size over 100", async () => {
    const headers = await adminHeaders();

    expect((await harness.get("/api/admin/events/0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11/bought-tickets", headers)).statusCode).toBe(404);
    expect((await harness.get("/api/admin/events/nope/bought-tickets", headers)).statusCode).toBe(400);
    const event = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    expect((await harness.get(`/api/admin/events/${event.eventId}/bought-tickets?pageSize=101`, headers)).statusCode).toBe(400);
  });
});

describe("GET /api/admin/events/:eventId/bought-tickets page depth", () => {
  it("serves the last allowed offset (20,000 limit) and rejects the first deeper one with PAGE_TOO_DEEP", async () => {
    const event = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    const headers = await adminHeaders();
    const url = (query: string): string => `/api/admin/events/${event.eventId}/bought-tickets?${query}`;

    const ok = await harness.get(url("page=200&pageSize=100"), headers);
    const tooDeep = await harness.get(url("page=201&pageSize=100"), headers);

    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ items: [], page: 200 });
    expect(tooDeep.statusCode).toBe(400);
    expect(tooDeep.json()).toMatchObject({ error: { code: "PAGE_TOO_DEEP" } });
    expect((await harness.get(url("page=20000&pageSize=1"), headers)).statusCode).toBe(200);
    expect((await harness.get(url("page=20001&pageSize=1"), headers)).statusCode).toBe(400);
  });
});
