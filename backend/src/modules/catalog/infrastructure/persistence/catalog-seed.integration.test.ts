import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { SeedCatalogService } from "../../application/seed-catalog-service.js";
import { PrismaCatalogSeedRepository } from "./prisma-catalog-seed-repository.js";
import { useBookingDatabase } from "./catalog-test-support.js";

const NOW = new Date("2026-01-01T12:00:00Z");

describe("catalog seed (real Postgres)", () => {
  const prisma = useBookingDatabase();

  function seedAt(now: Date) {
    return new SeedCatalogService({
      catalog: new PrismaCatalogSeedRepository(prisma),
      clock: new ControlledClock(now),
      currency: "EUR",
    }).seed();
  }

  async function counts() {
    const [row] = await prisma.client.$queryRaw<{ venues: number; shows: number; events: number; seats: number; per_event: number; available: number }[]>`
      SELECT (SELECT count(*) FROM venues)::int AS venues, (SELECT count(*) FROM shows)::int AS shows,
             (SELECT count(*) FROM events)::int AS events, (SELECT count(*) FROM seats)::int AS seats,
             (SELECT count(DISTINCT n)::int FROM (SELECT count(*) AS n FROM seats GROUP BY event_id) g) AS per_event,
             (SELECT count(*) FROM seats WHERE status = 'available')::int AS available`;
    return row;
  }

  it("creates 200 shows, 200 events and 40,000 seats, 200 per event", async () => {
    const result = await seedAt(NOW);

    expect(result).toEqual({ venues: 12, shows: 200, events: 200, seats: 40_000 });
    expect(await counts()).toEqual({ venues: 12, shows: 200, events: 200, seats: 40_000, per_event: 1, available: 40_000 });
    const [grid] = await prisma.client.$queryRaw<{ rows: string[]; max_no: number }[]>`
      SELECT array_agg(DISTINCT row_label ORDER BY row_label) AS rows, max(seat_number)::int AS max_no FROM seats`;
    expect(grid).toEqual({ rows: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], max_no: 20 });
    const [per] = await prisma.client.$queryRaw<{ n: number }[]>`SELECT min(c)::int AS n FROM (SELECT count(*) AS c FROM seats GROUP BY event_id) g`;
    expect(per?.n).toBe(200);
  });

  it("leaves every count unchanged when run a second time", async () => {
    await seedAt(NOW);
    const before = await counts();

    const second = await seedAt(NOW);

    expect(second).toEqual({ venues: 0, shows: 0, events: 0, seats: 0 });
    expect(await counts()).toEqual(before);
  });

  it("does not duplicate venues, shows, events or seats when seeded again with a different now", async () => {
    await seedAt(NOW);

    await seedAt(new Date("2026-02-15T09:30:00Z"));

    expect(await counts()).toMatchObject({ venues: 12, shows: 200, events: 200, seats: 40_000 });
  });

  it("keeps seats that are already held or sold as they are", async () => {
    await seedAt(NOW);
    await prisma.client.$executeRaw`UPDATE seats SET status = 'sold' WHERE id = (SELECT id FROM seats LIMIT 1)`;

    await seedAt(NOW);

    const [row] = await prisma.client.$queryRaw<{ sold: number }[]>`SELECT count(*) FILTER (WHERE status = 'sold')::int AS sold FROM seats`;
    expect(row?.sold).toBe(1);
  });
});
