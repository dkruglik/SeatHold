import { describe, expect, it } from "vitest";
import { VENUES, insertCatalogFixture, insertVenue, insertShow, SHOWS } from "../../infrastructure/persistence/catalog-search-fixture.js";
import { useCatalogApp } from "./catalog-route-test-support.js";

describe("GET /api/shows/facets", () => {
  const harness = useCatalogApp();

  it("returns the sorted values that have an upcoming event, and nothing else", async () => {
    await insertCatalogFixture(harness.prisma);
    await insertVenue(harness.prisma, { id: "00000001-0000-4000-8000-0000000000ff", name: "Empty House", city: "Rome", countryCode: "IT", timezone: "Europe/Rome" });
    await insertShow(harness.prisma, { id: "00000002-0000-4000-8000-0000000000ff", title: "Unused", type: "opera", genre: "baroque" });

    const response = await harness.get("/api/shows/facets");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      types: ["concert", "theatre"],
      genres: ["ballet", "drama", "jazz", "rock"],
      countries: ["DE", "FR", "GB"],
      cities: ["Berlin", "London", "Paris"],
      venues: [
        { id: VENUES.wild.id, name: "Base_ment 100%", city: "Berlin" },
        { id: VENUES.club.id, name: "Basement Club", city: "Paris" },
        { id: VENUES.olympia.id, name: "Olympia Hall", city: "Berlin" },
        { id: VENUES.arena.id, name: "Royal Arena", city: "London" },
      ],
    });
  });

  it("returns empty lists on an empty catalog", async () => {
    expect((await harness.get("/api/shows/facets")).json()).toEqual({ types: [], genres: [], countries: [], cities: [], venues: [] });
  });

  it("leaves out a show whose only event has started", async () => {
    await insertCatalogFixture(harness.prisma);
    await harness.prisma.client.$executeRaw`DELETE FROM seats WHERE event_id IN (SELECT id FROM events WHERE show_id = ${SHOWS.swan.id}::uuid)`;
    await harness.prisma.client.$executeRaw`UPDATE events SET starts_at = '2030-01-01T00:00:00Z' WHERE show_id = ${SHOWS.swan.id}::uuid`;
    const body = (await harness.get("/api/shows/facets")).json() as { genres: string[]; cities: string[] };
    expect(body.genres).not.toContain("ballet");
    expect(body.cities).not.toContain("Paris");
  });

  it("is public, sets no cookie and is cacheable for a minute", async () => {
    const response = await harness.get("/api/shows/facets");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
  });
});
