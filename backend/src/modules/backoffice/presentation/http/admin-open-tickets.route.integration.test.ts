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

interface OpenBody {
  event: { eventId: string; showTitle: string; startsAt: string; venueName: string; city: string; timezone: string };
  items: { seatId: string; row: string; number: number; state: string; heldUntil: string | null }[];
  total: number; page: number; pageSize: number; totalPages: number;
}
const open = async (eventId: string, query = ""): Promise<OpenBody> => (await harness.get(`/api/admin/events/${eventId}/open-tickets${query}`, await adminHeaders())).json() as OpenBody;

describe("GET /api/admin/events/:eventId/open-tickets", () => {
  it("lists available and live-held seats, shows an expired hold as available and leaves sold out", async () => {
    const event = await seedEvent(harness.prisma, { title: "Open show", seats: [["A", 1], ["A", 2], ["A", 3], ["A", 4]] });
    await holdSeat(harness.prisma, event.eventId, event.seat.A1 ?? "", minutes(5));
    await holdSeat(harness.prisma, event.eventId, event.seat.A2 ?? "", minutes(-5));
    await seedBooking(harness.prisma, { eventId: event.eventId, seatIds: [event.seat.A3 ?? ""], guestEmail: "g@example.io", createdAt: minutes(-60) });

    const response = await harness.get(`/api/admin/events/${event.eventId}/open-tickets`, await adminHeaders());
    const body = response.json() as OpenBody;

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(body.event).toEqual({
      eventId: event.eventId, showTitle: "Open show", startsAt: "2030-06-01T18:00:00.000Z", venueName: expect.stringMatching(/^Hall /), city: "Berlin", timezone: "Europe/Berlin",
    });
    expect(body.items).toEqual([
      { seatId: event.seat.A1, row: "A", number: 1, state: "held", heldUntil: minutes(5).toISOString() },
      { seatId: event.seat.A2, row: "A", number: 2, state: "available", heldUntil: null },
      { seatId: event.seat.A4, row: "A", number: 4, state: "available", heldUntil: null },
    ]);
    expect([body.total, body.page, body.pageSize, body.totalPages]).toEqual([3, 1, 50, 1]);
  });

  it("orders by row length then label then seat number, so AA comes after Z", async () => {
    const event = await seedEvent(harness.prisma, { seats: [["AA", 1], ["B", 2], ["Z", 1], ["B", 1], ["A", 1]] });

    const body = await open(event.eventId);

    expect(body.items.map((i) => `${i.row}${i.number}`)).toEqual(["A1", "B1", "B2", "Z1", "AA1"]);
  });

  it("pages without gaps or repeats", async () => {
    const seats = Array.from({ length: 7 }, (_, i) => ["A", i + 1] as const);
    const event = await seedEvent(harness.prisma, { seats });

    const pages = [await open(event.eventId, "?page=1&pageSize=3"), await open(event.eventId, "?page=2&pageSize=3"), await open(event.eventId, "?page=3&pageSize=3")];

    expect(pages.flatMap((p) => p.items.map((i) => i.number))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pages[0]).toMatchObject({ total: 7, totalPages: 3, pageSize: 3 });
  });

  it("answers 404 for an unknown event and 400 for a malformed id or a page size over 100", async () => {
    const headers = await adminHeaders();

    expect((await harness.get("/api/admin/events/0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11/open-tickets", headers)).statusCode).toBe(404);
    expect((await harness.get("/api/admin/events/not-a-uuid/open-tickets", headers)).statusCode).toBe(400);
    const event = await seedEvent(harness.prisma, { seats: [["A", 1]] });
    expect((await harness.get(`/api/admin/events/${event.eventId}/open-tickets?pageSize=101`, headers)).statusCode).toBe(400);
  });
});
