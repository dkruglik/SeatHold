import type { ExpireHoldsService } from "../modules/booking/index.js";
import type { CommandIo } from "./command-io.js";

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 10_000;
const USAGE = `Usage: npm run sweep:holds -w backend -- [--batch-size=<1-${MAX_BATCH_SIZE}>] (default ${DEFAULT_BATCH_SIZE})`;
const OPTION = "--batch-size=";

export interface SweepHoldsCommandDeps {
  readonly sweeper: Pick<ExpireHoldsService, "sweep">;
  readonly io: CommandIo;
}

/** Returns the batch size from the arguments, or undefined when they are invalid. */
function parseBatchSize(argv: readonly string[]): number | undefined {
  if (argv.length === 0) return DEFAULT_BATCH_SIZE;
  const [arg] = argv;
  if (argv.length > 1 || arg === undefined || !arg.startsWith(OPTION)) return undefined;
  const value = arg.slice(OPTION.length);
  if (!/^[1-9][0-9]*$/.test(value)) return undefined;
  const size = Number(value);
  return size <= MAX_BATCH_SIZE ? size : undefined;
}

/**
 * `sweep:holds`: runs the hold sweeper once, so it can run as a one-off task instead of on every instance.
 * Allowed in production (it only frees expired holds). Returns the exit code: 0 done, 2 bad arguments.
 */
export async function runSweepHoldsCommand(argv: readonly string[], { sweeper, io }: SweepHoldsCommandDeps): Promise<number> {
  const batchSize = parseBatchSize(argv);
  if (batchSize === undefined) {
    io.err(USAGE);
    return 2;
  }
  const { freedSeats, expiredHolds } = await sweeper.sweep({ batchSize });
  io.out(`holds swept freedSeats=${freedSeats} expiredHolds=${expiredHolds}`);
  return 0;
}
