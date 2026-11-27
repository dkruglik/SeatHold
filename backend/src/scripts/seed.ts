import { SeedUsersService } from "../modules/auth/application/seed-users-service.js";
import { runSeedCommand } from "./seed-command.js";
import { processIo, runScript } from "./script-runtime.js";

process.exitCode = await runScript(process.env, processIo, ({ config, users, clock }) =>
  runSeedCommand({ appEnv: config.appEnv, seed: new SeedUsersService({ users, clock }), io: processIo }),
);
