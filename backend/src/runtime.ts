import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config/load-config.js";
import { createAuthServices, createEmailProvider, createPrismaAuthRepositories } from "./modules/auth/index.js";
import { PrismaService } from "./infrastructure/persistence/prisma-service.js";
import type { Runtime } from "./run.js";
import { DatabaseClock } from "./shared/time/database-clock.js";

/** The real app and database pool, built from validated config. Tests of `run` pass fakes instead. */
export function createDefaultRuntime(config: AppConfig): Runtime & { readonly app: FastifyInstance } {
  const prisma = new PrismaService(config.databaseUrl, config.databasePoolMax);
  const clock = new DatabaseClock(prisma);
  // The console provider (local only; production config refuses it) prints the whole email, so the developer can read the code.
  const email = createEmailProvider(config, { writeLine: (line) => process.stdout.write(`${line}\n`) });
  const services = createAuthServices(config, { clock, email, ...createPrismaAuthRepositories(prisma) });
  return { prisma, app: buildApp(config, { clock, auth: { services } }) };
}
