import { SeedUsersService } from "../modules/auth/application/seed-users-service.js";
import { createCatalogServices } from "../modules/catalog/index.js";
import { runSeedCommand } from "./seed-command.js";
import { processIo, runScript } from "./script-runtime.js";

process.exitCode = await runScript(process.env, processIo, ({ config, users, catalog, clock }) =>
  runSeedCommand({
    appEnv: config.appEnv,
    seed: new SeedUsersService({ users, clock }),
    catalog: createCatalogServices(config, { ...catalog, clock }).seedCatalog,
    io: processIo,
  }),
);
