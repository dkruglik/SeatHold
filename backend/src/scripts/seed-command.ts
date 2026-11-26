import type { SeedUsersService } from "../modules/auth/application/seed-users-service.js";
import type { AppConfig } from "../config/load-config.js";
import type { CommandIo } from "./command-io.js";

export interface SeedCommandDeps {
  readonly appEnv: AppConfig["appEnv"];
  readonly seed: Pick<SeedUsersService, "seed">;
  readonly io: CommandIo;
}

/** `seed`: local only, because the seeded admin has a well-known email. Returns the exit code. */
export async function runSeedCommand({ appEnv, seed, io }: SeedCommandDeps): Promise<number> {
  if (appEnv === "production") {
    io.err("seed refuses to run when APP_ENV=production: the seeded admin has a well-known email.");
    return 1;
  }
  for (const result of await seed.seed()) {
    io.out(`${result.status} ${result.role} ${result.email}`);
  }
  return 0;
}
