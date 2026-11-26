import { describe, expect, it } from "vitest";
import type { SeedResult } from "../modules/auth/application/seed-users-service.js";
import type { CatalogSeedResult } from "../modules/catalog/index.js";
import { runSeedCommand } from "./seed-command.js";

const results: SeedResult[] = [
  { email: "admin@seathold.local", role: "admin", status: "created" },
  { email: "buyer@seathold.local", role: "buyer", status: "exists" },
];

const catalogResult: CatalogSeedResult = { venues: 12, shows: 200, events: 200, seats: 40_000 };

function setup() {
  const out: string[] = [];
  const err: string[] = [];
  let seeded = 0;
  let catalogSeeded = 0;
  const seed = { seed: () => { seeded += 1; return Promise.resolve(results); } };
  const catalog = { seed: () => { catalogSeeded += 1; return Promise.resolve(catalogResult); } };
  return { out, err, seeded: () => seeded, catalogSeeded: () => catalogSeeded, run: (appEnv: "local" | "production") => runSeedCommand({ appEnv, seed, catalog, io: { out: (l) => out.push(l), err: (l) => err.push(l) } }) };
}

describe("runSeedCommand", () => {
  it("prints each account's email, role and status, then the catalog counts, and exits 0", async () => {
    const t = setup();

    expect(await t.run("local")).toBe(0);
    expect(t.out).toEqual([
      "created admin admin@seathold.local",
      "exists buyer buyer@seathold.local",
      "catalog inserted venues=12 shows=200 events=200 seats=40000",
    ]);
    expect(t.catalogSeeded()).toBe(1);
  });

  it("refuses to run in production: exit 1, nothing seeded", async () => {
    const t = setup();

    expect(await t.run("production")).toBe(1);
    expect(t.seeded()).toBe(0);
    expect(t.catalogSeeded()).toBe(0);
    expect(t.err).toEqual(["seed refuses to run when APP_ENV=production: the seeded admin has a well-known email."]);
  });
});
