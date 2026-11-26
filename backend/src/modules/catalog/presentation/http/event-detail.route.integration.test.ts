import { describe, expect, it } from "vitest";
import { EVENTS, NOW, SHOWS, VENUES, insertCatalogFixture, insertEvent, uuid } from "../../infrastructure/persistence/catalog-search-fixture.js";
import { useCatalogApp } from "./catalog-route-test-support.js";

describe("GET /api/events/:eventId", () => {
  const harness = useCatalogApp();

  it("returns the show, venue, start, price, grid and seats left, cacheable for a second and without cookies", async () => {
    await insertCatalogFixture(harness.prisma);

    const response = await harness.get(`/api/events/${EVENTS.rockBerlin}`);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=1");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.json()).toEqual({
      eventId: EVENTS.rockBerlin, showId: SHOWS.rock.id, title: "Rock Night", type: "concert", genre: "rock", description: "d",
      venue: { id: VENUES.olympia.id, name: "Olympia Hall", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
      startsAt: "2030-07-01T18:00:00.000Z", priceMinor: 4500, currency: "EUR", rows: 1, seatsPerRow: 4, seatsLeft: 4,
    });
  });

  it("counts a sold seat and a live hold as taken, and a hold that ended at or before now as available", async () => {
    await insertCatalogFixture(harness.prisma);
    const seats = await insertEvent(harness.prisma, { id: uuid(3, 50), show: SHOWS.jazz, venue: VENUES.arena, startsAt: new Date("2030-10-01T18:00:00.000Z"), seats: 4 });
    const [hold] = await harness.prisma.client.$queryRaw<{ id: string }[]>`
      INSERT INTO holds (event_id, visitor_hash, expires_at, status, created_at)
      VALUES (${uuid(3, 50)}::uuid, 'v', ${NOW}, 'active', ${NOW}) RETURNING id`;
    await harness.prisma.client.$executeRaw`UPDATE seats SET status = 'sold' WHERE id = ${seats[0]}::uuid`;
    await harness.prisma.client.$executeRaw`UPDATE seats SET status = 'held', hold_id = ${hold?.id}::uuid, held_until = ${new Date(NOW.getTime() + 1)} WHERE id = ${seats[1]}::uuid`;
    await harness.prisma.client.$executeRaw`UPDATE seats SET status = 'held', hold_id = ${hold?.id}::uuid, held_until = ${NOW} WHERE id = ${seats[2]}::uuid`;

    const seatsLeft = async (): Promise<number> => (await harness.get(`/api/events/${uuid(3, 50)}`)).json<{ seatsLeft: number }>().seatsLeft;

    expect(await seatsLeft()).toBe(2);
    harness.clock.set(new Date(NOW.getTime() + 1));
    expect(await seatsLeft()).toBe(3);
  });

  it("answers 404 EVENT_NOT_FOUND for an unknown id", async () => {
    const response = await harness.get(`/api/events/${uuid(3, 77)}`);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: "EVENT_NOT_FOUND", message: expect.any(String) } });
  });

  it("answers 400 for an id that is not a uuid", async () => {
    const response = await harness.get("/api/events/not-a-uuid");

    expect(response.statusCode).toBe(400);
  });
});
