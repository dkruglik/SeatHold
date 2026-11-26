import { createCatalogServices } from "../modules/catalog/index.js";
import { runSeedCatalogCommand } from "./seed-catalog-command.js";
import { processIo, runScript } from "./script-runtime.js";

process.exitCode = await runScript(process.env, processIo, ({ config, catalog, clock }) =>
  runSeedCatalogCommand(process.argv.slice(2), { catalog: createCatalogServices(config, { ...catalog, clock }).seedCatalog, io: processIo }),
);
