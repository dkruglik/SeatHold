import { loadConfig, type AppConfig } from "../config/load-config.js";
import { PrismaService } from "../infrastructure/persistence/prisma-service.js";
import { PrismaUserRepository, type UserRepository } from "../modules/auth/index.js";
import { describeFailure } from "../run.js";
import { DatabaseClock } from "../shared/time/database-clock.js";
import type { Clock } from "../shared/time/clock.js";
import type { CommandIo } from "./command-io.js";

export interface ScriptContext {
  readonly config: AppConfig;
  readonly users: UserRepository;
  readonly clock: Clock;
}

/**
 * Runs a script body with validated config and the real database, then closes the pool. Returns the exit code.
 * A failure prints only what `run` prints for startup failures (config rules, or an error class and code): never a
 * connection string.
 */
export async function runScript(
  env: Readonly<Record<string, string | undefined>>,
  io: CommandIo,
  body: (context: ScriptContext) => Promise<number>,
): Promise<number> {
  let prisma: PrismaService | undefined;
  try {
    const config = loadConfig(env);
    prisma = new PrismaService(config.databaseUrl, config.databasePoolMax);
    await prisma.connect();
    return await body({ config, users: new PrismaUserRepository(prisma), clock: new DatabaseClock(prisma) });
  } catch (error: unknown) {
    io.err(describeFailure(error));
    return 1;
  } finally {
    await prisma?.disconnect();
  }
}

export const processIo: CommandIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};
