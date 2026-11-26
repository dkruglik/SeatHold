import { describe, expect, it } from "vitest";
import { runSweepHoldsCommand } from "./sweep-holds-command.js";

function setup() {
  const out: string[] = [];
  const err: string[] = [];
  const batchSizes: number[] = [];
  const sweeper = { sweep: (input: { batchSize: number }) => { batchSizes.push(input.batchSize); return Promise.resolve({ freedSeats: 7, expiredHolds: 3 }); } };
  const run = (argv: string[]) => runSweepHoldsCommand(argv, { sweeper, io: { out: (l) => out.push(l), err: (l) => err.push(l) } });
  return { out, err, batchSizes, run };
}

describe("runSweepHoldsCommand", () => {
  it("sweeps once with batch size 500 by default, prints one summary line and exits 0", async () => {
    const t = setup();

    expect(await t.run([])).toBe(0);
    expect(t.batchSizes).toEqual([500]);
    expect(t.out).toEqual(["holds swept freedSeats=7 expiredHolds=3"]);
    expect(t.err).toEqual([]);
  });

  it("uses the batch size from --batch-size, up to 10000", async () => {
    const t = setup();

    expect(await t.run(["--batch-size=25"])).toBe(0);
    expect(await t.run(["--batch-size=10000"])).toBe(0);
    expect(t.batchSizes).toEqual([25, 10_000]);
  });

  it.each([["--batch-size=0"], ["--batch-size=-5"], ["--batch-size=1.5"], ["--batch-size=abc"], ["--batch-size="], ["--batch-size=10001"], ["--batch-size=1e3"], ["--batch-size"], ["--bogus"], ["500"], ["--batch-size=5", "--batch-size=6"]])(
    "rejects %s with a usage line and exit code 2, sweeping nothing",
    async (...argv) => {
      const t = setup();

      expect(await t.run(argv)).toBe(2);
      expect(t.batchSizes).toEqual([]);
      expect(t.out).toEqual([]);
      expect(t.err).toHaveLength(1);
      expect(t.err[0]).toContain("Usage: npm run sweep:holds -w backend -- [--batch-size=<1-10000>]");
    },
  );
});
