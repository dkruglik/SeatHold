import type { SeedCatalogService } from "../modules/catalog/index.js";
import type { CommandIo } from "./command-io.js";

const USAGE = "Usage: npm run seed:catalog -w backend (takes no arguments)";

export interface SeedCatalogCommandDeps {
  readonly catalog: Pick<SeedCatalogService, "seed">;
  readonly io: CommandIo;
}

/**
 * `seed:catalog`: inserts the demo catalog only (venues, shows, events, seats), never a user. Idempotent, so it is
 * safe to run on any instance and in any environment. Returns the exit code: 0 done, 2 bad arguments.
 */
export async function runSeedCatalogCommand(argv: readonly string[], { catalog, io }: SeedCatalogCommandDeps): Promise<number> {
  if (argv.length > 0) {
    io.err(USAGE);
    return 2;
  }
  const created = await catalog.seed();
  io.out(`catalog inserted venues=${created.venues} shows=${created.shows} events=${created.events} seats=${created.seats}`);
  return 0;
}
