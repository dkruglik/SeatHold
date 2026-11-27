import { describe, expect, it } from "vitest";
import { PrismaUserRepository } from "../../../auth/index.js";
import { cookieHeader, sidOf, useAuthApp } from "../../../auth/presentation/http/auth-route-test-support.js";

const BODY = {
  show: { new: { title: "Hamlet Unbound", type: "theatre", genre: "drama", description: "A play" } },
  venue: { new: { name: "Globe", city: "London", countryCode: "gb", timezone: "Europe/London" } },
  startsAt: "2030-06-01T18:00:00.000Z",
  priceMinor: 5000,
  currency: "eur",
  rows: 28,
  seatsPerRow: 2,
};

const harness = useAuthApp();
const count = async (table: string): Promise<number> => {
  const [row] = await harness.prisma.client.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${table}`);
  return row?.n ?? 0;
};
const sessionAs = async (email: string, role: "buyer" | "admin"): Promise<Record<string, string>> => {
  const sid = sidOf(await harness.login(email));
  if (role === "admin") await new PrismaUserRepository(harness.prisma).setRoleByEmail(email, "admin");
  return cookieHeader(sid);
};
const create = async (body: object, role: "buyer" | "admin" = "admin") => harness.post("/api/admin/events", body, await sessionAs(`${role}@example.io`, role));


describe("POST /api/admin/events", () => {
  it("creates the event and its grid for an admin: 201, no-store, the event DTO", async () => {
    const response = await create(BODY);

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      eventId: expect.any(String), showId: expect.any(String), venueId: expect.any(String),
      title: "Hamlet Unbound", startsAt: "2030-06-01T18:00:00.000Z", priceMinor: 5000, currency: "EUR", rows: 28, seatsPerRow: 2, seatCount: 56,
    });
    expect(await count("seats")).toBe(56);
  });

  it("shows the created event in the public search and its seats in the seat map, AA after Z", async () => {
    const created = (await create(BODY)).json() as { eventId: string };

    const search = (await harness.get("/api/shows?q=Hamlet")).json() as { items: { eventId?: string; id?: string }[] };
    expect(JSON.stringify(search)).toContain(created.eventId);
    const map = (await harness.get(`/api/events/${created.eventId}/seats`)).json() as { seats: { row: string; number: number; state: string }[] };
    expect(map.seats).toHaveLength(56);
    expect(map.seats.every((s) => s.state === "available")).toBe(true);
    expect(new Set(map.seats.map((s) => s.row))).toContain("AA");
  });

  it("answers 404 for an unknown show or venue id and creates nothing", async () => {
    const unknown = "0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11";

    expect((await create({ ...BODY, show: { existingId: unknown } })).statusCode).toBe(404);
    expect((await create({ ...BODY, venue: { existingId: unknown } })).statusCode).toBe(404);
    expect([await count("events"), await count("shows"), await count("venues")]).toEqual([0, 0, 0]);
  });

  it("reuses an existing venue (name, city) given as new", async () => {
    await create(BODY);
    const again = await create({ ...BODY, show: { new: { ...BODY.show.new, title: "Other" } } });

    expect(again.statusCode).toBe(201);
    expect([await count("venues"), await count("shows"), await count("events")]).toEqual([1, 2, 2]);
  });

});

describe("POST /api/admin/events validation", () => {
  it.each([
    ["a grid over 20,000 seats", { rows: 101, seatsPerRow: 200 }],
    ["rows out of range", { rows: 201 }],
    ["a negative price", { priceMinor: -1 }],
    ["a start in the past", { startsAt: "2029-01-01T00:00:00.000Z" }],
    ["a bad timezone", { venue: { new: { ...BODY.venue.new, timezone: "Mars/Olympus" } } }],
    ["a bad currency", { currency: "EURO" }],
    ["an extra field", { admin: true }],
    ["an extra field inside show.new", { show: { new: { ...BODY.show.new, id: "x" } } }],
    ["both existingId and new", { show: { existingId: "0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11", new: BODY.show.new } }],
  ])("answers 400 for %s and creates nothing", async (_name, patch) => {
    const response = await create({ ...BODY, ...patch });

    expect(response.statusCode).toBe(400);
    expect(await count("events")).toBe(0);
  });

  it("gives domain violations the code INVALID_EVENT", async () => {
    const response = await create({ ...BODY, priceMinor: -1 });

    expect(response.json()).toEqual({ error: { code: "INVALID_EVENT", message: expect.any(String) } });
  });

});

describe("POST /api/admin/events access", () => {
  it("answers 401 to an anonymous caller and 403 to a signed-in buyer, creating nothing", async () => {
    const anonymous = await harness.post("/api/admin/events", BODY);
    const buyer = await create(BODY, "buyer");

    expect([anonymous.statusCode, buyer.statusCode]).toEqual([401, 403]);
    expect(await count("events")).toBe(0);
  });

  it("answers 403 CSRF_INVALID without a CSRF token", async () => {
    const response = await harness.postBare("/api/admin/events", BODY, { ...(await sessionAs("admin@example.io", "admin")), origin: "http://localhost:5173" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "CSRF_INVALID" } });
    expect(await count("events")).toBe(0);
  });
});
