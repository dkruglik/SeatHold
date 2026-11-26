export interface ShutdownLogger {
  info(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

export interface ShutdownOptions {
  readonly app: { close(): Promise<unknown> };
  readonly prisma: { disconnect(): Promise<void> };
  readonly logger: ShutdownLogger;
  readonly exit: (code: number) => void;
  readonly timeoutMs: number;
}

/**
 * Returns the signal handler. It stops the app (no new connections, in-flight requests finish), then
 * disconnects Prisma, then exits 0. When that takes longer than timeoutMs, or fails, it exits 1.
 * A second signal while shutting down does nothing.
 */
export function createShutdown({ app, prisma, logger, exit, timeoutMs }: ShutdownOptions): (signal: string) => Promise<void> {
  let running: Promise<void> | undefined;

  const stop = async (): Promise<void> => {
    await app.close();
    await prisma.disconnect();
  };

  return (signal) => {
    running ??= (async () => {
      logger.info({ signal, timeoutMs }, "shutdown started");
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      });
      try {
        const outcome = await Promise.race([stop().then(() => "stopped" as const), timeout]);
        if (outcome === "timeout") {
          logger.error({ signal, timeoutMs }, "shutdown timed out, exiting");
          exit(1);
          return;
        }
        logger.info({ signal }, "shutdown complete");
        exit(0);
      } catch (err) {
        logger.error({ err, signal }, "shutdown failed");
        exit(1);
      } finally {
        clearTimeout(timer);
      }
    })();
    return running;
  };
}
