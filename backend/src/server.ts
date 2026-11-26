import { buildApp } from "./app.js";
import { ConfigError, loadConfig } from "./config/load-config.js";
import { PrismaService } from "./infrastructure/persistence/prisma-service.js";
import { bindShutdownSignals, createShutdown } from "./shutdown.js";
import { DatabaseClock } from "./shared/time/database-clock.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const prisma = new PrismaService(config.databaseUrl, config.databasePoolMax);
  const app = buildApp(config, { clock: new DatabaseClock(prisma) });
  const shutdown = createShutdown({
    app,
    prisma,
    logger: app.log,
    exit: (code) => process.exit(code),
    timeoutMs: config.shutdownTimeoutMs,
  });
  bindShutdownSignals(process, shutdown);

  await prisma.connect();
  await app.listen({ host: config.backendHost, port: config.backendPort });
}

main().catch((error: unknown) => {
  // A ConfigError names variables and rules, never values; anything else is printed by its message only.
  const message = error instanceof ConfigError ? error.message : `Startup failed: ${error instanceof Error ? error.message : "unknown error"}`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
