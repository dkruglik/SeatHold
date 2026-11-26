import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CatalogSeedResult } from "../modules/catalog/index.js";
import { runSeedCatalogCommand } from "./seed-catalog-command.js";

function setup(result: CatalogSeedResult) {
  const out: string[] = [];
  const err: string[] = [];
  let seeded = 0;
  const catalog = { seed: () => { seeded += 1; return Promise.resolve(result); } };
  return { out, err, seeded: () => seeded, run: (argv: readonly string[] = []) => runSeedCatalogCommand(argv, { catalog, io: { out: (l) => out.push(l), err: (l) => err.push(l) } }) };
}

describe("runSeedCatalogCommand", () => {
  it("seeds once, prints the counts line and exits 0", async () => {
    const t = setup({ venues: 12, shows: 200, events: 200, seats: 40_000 });

    expect(await t.run()).toBe(0);
    expect(t.out).toEqual(["catalog inserted venues=12 shows=200 events=200 seats=40000"]);
    expect(t.err).toEqual([]);
    expect(t.seeded()).toBe(1);
  });

  it("prints zeros for a rerun that inserted nothing", async () => {
    const t = setup({ venues: 0, shows: 0, events: 0, seats: 0 });

    expect(await t.run()).toBe(0);
    expect(t.out).toEqual(["catalog inserted venues=0 shows=0 events=0 seats=0"]);
  });

  it("rejects any argument: usage on stderr, exit 2, nothing seeded", async () => {
    const t = setup({ venues: 1, shows: 1, events: 1, seats: 1 });

    expect(await t.run(["--force"])).toBe(2);
    expect(t.err).toEqual(["Usage: npm run seed:catalog -w backend (takes no arguments)"]);
    expect(t.out).toEqual([]);
    expect(t.seeded()).toBe(0);
  });

  it("has no environment input and never touches the auth module, so it is safe in production", () => {
    const source = readFileSync(new URL("./seed-catalog-command.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/appEnv|APP_ENV|production/);
    expect(source).not.toMatch(/modules\/auth|users?Repository|SeedUsers/);
  });
});
