import { ConfigError, loadConfig, type AppConfig } from "./config/load-config.js";
import { createDefaultRuntime } from "./runtime.js";
import { bindShutdownSignals, createShutdown, type ShutdownLogger, type SignalSource } from "./shutdown.js";

export interface RunApp {
  readonly log: ShutdownLogger;
  close(): Promise<unknown>;
  listen(options: { host: string; port: number }): Promise<unknown>;
}

export interface RunPrisma {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface Runtime {
  readonly app: RunApp;
  readonly prisma: RunPrisma;
}

/** The process ports `run` needs, so tests can observe output, exit codes and signals. */
export interface RunIo {
  readonly stderr: { write(text: string): unknown };
  readonly exit: (code: number) => void;
  readonly signals: SignalSource;
}

/**
 * What is safe to print about a startup failure: a ConfigError names variables and rules, never values.
 * Any other error prints its class and `code` only: its message may carry a connection string with the password (rule 13).
 */
export function describeFailure(error: unknown): string {
  if (error instanceof ConfigError) {
    return error.message;
  }
  if (!(error instanceof Error)) {
    return "Startup failed: unknown error";
  }
  const code = (error as { code?: unknown }).code;
  const suffix = typeof code === "string" || typeof code === "number" ? ` (code ${code})` : "";
  return `Startup failed: ${error.name}${suffix}`;
}

/** Starts the backend. Never rejects: a failure is printed and turned into exit code 1. */
export async function run(
  env: Readonly<Record<string, string | undefined>>,
  io: RunIo,
  createRuntime: (config: AppConfig) => Runtime = createDefaultRuntime,
): Promise<void> {
  let stopping = false;
  try {
    const config = loadConfig(env);
    const { app, prisma } = createRuntime(config);
    const shutdown = createShutdown({ app, prisma, logger: app.log, exit: io.exit, timeoutMs: config.shutdownTimeoutMs });
    bindShutdownSignals(io.signals, (signal) => {
      stopping = true;
      return shutdown(signal);
    });

    await prisma.connect();
    if (!stopping) {
      await app.listen({ host: config.backendHost, port: config.backendPort });
    }
  } catch (error: unknown) {
    // A signal during startup already runs the shutdown path, which decides the exit code.
    if (!stopping) {
      io.stderr.write(`${describeFailure(error)}\n`);
      io.exit(1);
    }
  }
}
