import { describe, expect, it } from "vitest";
import { ControlledClock } from "../shared/time/controlled-clock.js";
import { SeedCatalogService } from "../modules/catalog/index.js";
import { PrismaCatalogSeedRepository } from "../modules/catalog/index.js";
import { useBookingDatabase } from "../modules/catalog/infrastructure/persistence/catalog-test-support.js";
import { runSeedCatalogCommand } from "./seed-catalog-command.js";

describe("the seed:catalog command on the database", () => {
  const prisma = useBookingDatabase();
  const catalog = new SeedCatalogService({ catalog: new PrismaCatalogSeedRepository(prisma), clock: new ControlledClock(new Date("2026-01-01T12:00:00Z")), currency: "EUR" });
  const out: string[] = [];
  const err: string[] = [];
  const run = (argv: string[] = []) => runSeedCatalogCommand(argv, { catalog, io: { out: (l) => out.push(l), err: (l) => err.push(l) } });

  async function counts() {
    const [row] = await prisma.client.$queryRaw<Record<"venues" | "shows" | "events" | "seats" | "users", number>[]>`
      SELECT (SELECT count(*) FROM venues)::int AS venues, (SELECT count(*) FROM shows)::int AS shows,
             (SELECT count(*) FROM events)::int AS events, (SELECT count(*) FROM seats)::int AS seats,
             (SELECT count(*) FROM users)::int AS users`;
    return row;
  }

  it("inserts the catalog and no user; a second run inserts nothing", async () => {
    expect(await run()).toBe(0);
    expect(out).toEqual(["catalog inserted venues=12 shows=200 events=200 seats=40000"]);
    expect(await counts()).toEqual({ venues: 12, shows: 200, events: 200, seats: 40_000, users: 0 });

    expect(await run()).toBe(0);
    expect(out.at(-1)).toBe("catalog inserted venues=0 shows=0 events=0 seats=0");
    expect(await counts()).toEqual({ venues: 12, shows: 200, events: 200, seats: 40_000, users: 0 });
    expect(err).toEqual([]);
  });
});
