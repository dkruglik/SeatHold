import { describe, expect, it } from "vitest";
import { EVENTS, NOW, SHOWS, VENUES, insertCatalogFixture, insertEvent, uuid } from "../../infrastructure/persistence/catalog-search-fixture.js";
import { useCatalogApp } from "./catalog-route-test-support.js";

interface Item { eventId: string; title: string; seatsLeft: number; [key: string]: unknown }
interface Page { items: Item[]; total: number; page: number; pageSize: number; totalPages: number }

describe("GET /api/shows filters", () => {
  const harness = useCatalogApp();
  const ids = async (query: string): Promise<string[]> => {
    const response = await harness.get(`/api/shows${query}`);
    expect(response.statusCode).toBe(200);
    return (response.json() as Page).items.map((i) => i.eventId);
  };
  const seed = () => insertCatalogFixture(harness.prisma);

  it("returns one row per upcoming event with show, venue, start, price and seats left, ordered by start then id", async () => {
    await seed();
    const response = await harness.get("/api/shows");
    const body = response.json() as Page;
    expect(body.items.map((i) => i.eventId)).toEqual([EVENTS.rockBerlin, EVENTS.rockLondon, EVENTS.jazzBerlin, EVENTS.hamletLondon, EVENTS.hamletWild, EVENTS.swanParis]);
    expect(body.items[0]).toEqual({
      eventId: EVENTS.rockBerlin, showId: SHOWS.rock.id, title: "Rock Night", type: "concert", genre: "rock",
      venue: { id: VENUES.olympia.id, name: "Olympia Hall", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
      startsAt: "2030-07-01T18:00:00.000Z", priceMinor: 4500, currency: "EUR", seatsLeft: 4,
    });
    expect(body).toMatchObject({ total: 6, page: 1, pageSize: 20, totalPages: 1 });
  });

  it("filters by type, genre, country, city and venue alone", async () => {
    await seed();
    expect(await ids("?type=theatre")).toEqual([EVENTS.hamletLondon, EVENTS.hamletWild, EVENTS.swanParis]);
    expect(await ids("?genre=jazz")).toEqual([EVENTS.jazzBerlin]);
    expect(await ids("?country=GB")).toEqual([EVENTS.rockLondon, EVENTS.hamletLondon]);
    expect(await ids("?city=Paris")).toEqual([EVENTS.swanParis]);
    expect(await ids(`?venueId=${VENUES.olympia.id}`)).toEqual([EVENTS.rockBerlin, EVENTS.jazzBerlin]);
  });

  it("accepts the country in lower case", async () => {
    await seed();
    expect(await ids("?country=gb")).toEqual([EVENTS.rockLondon, EVENTS.hamletLondon]);
  });

  it("combines filters with AND", async () => {
    await seed();
    expect(await ids("?type=concert&country=DE")).toEqual([EVENTS.rockBerlin, EVENTS.jazzBerlin]);
    expect(await ids("?type=theatre&city=Berlin&genre=drama")).toEqual([EVENTS.hamletWild]);
    expect(await ids("?type=concert&genre=drama")).toEqual([]);
  });

});

describe("GET /api/shows date range", () => {
  const harness = useCatalogApp();
  const ids = async (query: string): Promise<string[]> => ((await harness.get(`/api/shows${query}`)).json() as Page).items.map((i) => i.eventId);
  const seed = () => insertCatalogFixture(harness.prisma);

  it("includes events exactly at from and at to, and excludes events 1 ms outside", async () => {
    await seed();
    expect(await ids("?from=2030-07-02T18:00:00.000Z&to=2030-08-01T18:00:00.000Z")).toEqual([EVENTS.rockLondon, EVENTS.jazzBerlin, EVENTS.hamletLondon]);
    expect(await ids("?from=2030-07-02T18:00:00.001Z&to=2030-08-01T17:59:59.999Z")).toEqual([]);
  });

  it("lists past events only when from reaches back, and only upcoming ones by default", async () => {
    await seed();
    expect(await ids("")).not.toContain(EVENTS.past);
    expect((await ids("?from=2030-01-01T00:00:00.000Z"))[0]).toBe(EVENTS.past);
  });

  it("treats an event starting exactly now as already started", async () => {
    await seed();
    await insertEvent(harness.prisma, { id: uuid(3, 99), show: SHOWS.jazz, venue: VENUES.arena, startsAt: NOW });
    expect(await ids("")).not.toContain(uuid(3, 99));
  });

  it("rejects from after to with 400", async () => {
    const response = await harness.get("/api/shows?from=2030-08-01T00:00:00.000Z&to=2030-07-01T00:00:00.000Z");
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "invalid_date_range" } });
  });
});

describe("GET /api/shows text search", () => {
  const harness = useCatalogApp();
  const ids = async (query: string): Promise<string[]> => ((await harness.get(`/api/shows${query}`)).json() as Page).items.map((i) => i.eventId);

  it("matches the show title by word, case-insensitively", async () => {
    await insertCatalogFixture(harness.prisma);
    expect(await ids("?q=rock")).toEqual([EVENTS.rockBerlin, EVENTS.rockLondon]);
    expect(await ids("?q=SWAN%20lake")).toEqual([EVENTS.swanParis]);
  });

  it("matches the venue name by substring, case-insensitively", async () => {
    await insertCatalogFixture(harness.prisma);
    expect(await ids("?q=royal")).toEqual([EVENTS.rockLondon, EVENTS.hamletLondon]);
    expect(await ids("?q=lympia")).toEqual([EVENTS.rockBerlin, EVENTS.jazzBerlin]);
  });

  it("combines q with the other filters", async () => {
    await insertCatalogFixture(harness.prisma);
    expect(await ids("?q=royal&type=theatre")).toEqual([EVENTS.hamletLondon]);
  });

  it("does not treat % or _ in q as wildcards", async () => {
    await insertCatalogFixture(harness.prisma);
    expect(await ids("?q=%25")).toEqual([EVENTS.hamletWild]);
    expect(await ids("?q=Base_ment")).toEqual([EVENTS.hamletWild]);
    expect(await ids("?q=B%25t")).toEqual([]);
    expect(await ids("?q=Ro_al")).toEqual([]);
    expect(await ids("?q=%5C")).toEqual([]);
  });

  it("treats quotes and SQL text in q as plain text", async () => {
    await insertCatalogFixture(harness.prisma);
    expect(await ids("?q=%27%3B%20DROP%20TABLE%20shows%3B--")).toEqual([]);
    expect(((await harness.get("/api/shows")).json() as Page).total).toBe(6);
  });
});

describe("GET /api/shows pagination", () => {
  const harness = useCatalogApp();

  it("pages without duplicates or gaps, with ties on the start broken by id, and repeats the same order", async () => {
    await insertCatalogFixture(harness.prisma);
    for (let n = 10; n < 17; n += 1) {
      await insertEvent(harness.prisma, { id: uuid(3, n), show: SHOWS.rock, venue: VENUES.arena, startsAt: new Date("2030-10-01T18:00:00.000Z") });
    }
    const collect = async (): Promise<string[]> => {
      const all: string[] = [];
      for (let page = 1; page <= 5; page += 1) {
        const body = (await harness.get(`/api/shows?pageSize=4&page=${page}`)).json() as Page;
        expect(body).toMatchObject({ total: 13, page, pageSize: 4, totalPages: 4 });
        all.push(...body.items.map((i) => i.eventId));
      }
      return all;
    };
    const first = await collect();
    expect(first).toHaveLength(13);
    expect(new Set(first).size).toBe(13);
    expect(first.slice(6)).toEqual([...first.slice(6)].sort());
    expect(await collect()).toEqual(first);
  });

  it("returns an empty page with the total past the last page", async () => {
    await insertCatalogFixture(harness.prisma);
    const body = (await harness.get("/api/shows?page=9")).json() as Page;
    expect(body).toMatchObject({ items: [], total: 6, page: 9 });
  });

  it("rejects page 0, pageSize 0 and pageSize 51 with 400, and accepts pageSize 50", async () => {
    expect((await harness.get("/api/shows?page=0")).statusCode).toBe(400);
    expect((await harness.get("/api/shows?pageSize=0")).statusCode).toBe(400);
    expect((await harness.get("/api/shows?pageSize=51")).statusCode).toBe(400);
    expect((await harness.get("/api/shows?pageSize=50")).statusCode).toBe(200);
  });
});

describe("GET /api/shows validation and headers", () => {
  const harness = useCatalogApp();

  it.each([
    ["a malformed venueId", "?venueId=not-a-uuid"],
    ["a malformed from", "?from=yesterday"],
    ["a three-letter country", "?country=DEU"],
    ["an unknown parameter", "?colour=red"],
    ["an empty type", "?type="],
  ])("rejects %s with 400", async (_name, query) => {
    const response = await harness.get(`/api/shows${query}`);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "invalid_request" } });
  });

  it("is public, sets no cookie and is cacheable for one second", async () => {
    const response = await harness.get("/api/shows");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("public, max-age=1");
  });
});

describe("GET /api/shows seatsLeft", () => {
  const harness = useCatalogApp();

  it("counts available seats and expired holds, and not live holds or sold seats", async () => {
    const seatIds = await (async () => {
      await insertCatalogFixture(harness.prisma);
      return harness.prisma.client.$queryRaw<{ id: string }[]>`SELECT id FROM seats WHERE event_id = ${EVENTS.rockBerlin}::uuid ORDER BY seat_number`;
    })();
    const [available, expired, expiresNow, live] = seatIds.map((s) => s.id);
    const holdId = (await harness.prisma.client.$queryRaw<{ id: string }[]>`
      INSERT INTO holds (event_id, visitor_hash, expires_at, status, created_at) VALUES (${EVENTS.rockBerlin}::uuid, 'v', ${NOW}, 'active', ${NOW}) RETURNING id`)[0]?.id;
    const before = new Date(NOW.getTime() - 1000);
    const after = new Date(NOW.getTime() + 1000);
    await harness.prisma.client.$executeRaw`UPDATE seats SET status = 'held', hold_id = ${holdId}::uuid, held_until = ${before} WHERE id = ${expired}::uuid`;
    await harness.prisma.client.$executeRaw`UPDATE seats SET status = 'held', hold_id = ${holdId}::uuid, held_until = ${NOW} WHERE id = ${expiresNow}::uuid`;
    await harness.prisma.client.$executeRaw`UPDATE seats SET status = 'held', hold_id = ${holdId}::uuid, held_until = ${after} WHERE id = ${live}::uuid`;
    expect(available).toBeDefined();

    const find = async () => ((await harness.get("/api/shows?genre=rock&country=DE")).json() as Page).items[0]?.seatsLeft;
    expect(await find()).toBe(3);

    await harness.prisma.client.$executeRaw`UPDATE seats SET status = 'sold', hold_id = NULL, held_until = NULL WHERE id = ${available}::uuid`;
    expect(await find()).toBe(2);

    harness.clock.set(after);
    expect(await find()).toBe(3);
  });

  it("reports 0 for an event with no seats left", async () => {
    await insertCatalogFixture(harness.prisma);
    await harness.prisma.client.$executeRaw`UPDATE seats SET status = 'sold' WHERE event_id = ${EVENTS.swanParis}::uuid`;
    const body = (await harness.get("/api/shows?city=Paris")).json() as Page;
    expect(body.items[0]?.seatsLeft).toBe(0);
  });
});
