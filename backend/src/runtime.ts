import { buildApp } from "./app.js";
import type { AppConfig } from "./config/load-config.js";
import { PrismaService } from "./infrastructure/persistence/prisma-service.js";
import type { Runtime } from "./run.js";
import { DatabaseClock } from "./shared/time/database-clock.js";

/** The real app and database pool, built from validated config. Tests of `run` pass fakes instead. */
export function createDefaultRuntime(config: AppConfig): Runtime {
  const prisma = new PrismaService(config.databaseUrl, config.databasePoolMax);
  return { prisma, app: buildApp(config, { clock: new DatabaseClock(prisma) }) };
}
