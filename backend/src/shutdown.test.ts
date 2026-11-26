import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { bindShutdownSignals, createShutdown } from "./shutdown.js";

function setup(options: { appClose?: () => Promise<void>; disconnect?: () => Promise<void>; timeoutMs?: number } = {}) {
  const calls: string[] = [];
  const logger = { info: vi.fn(), error: vi.fn() };
  const exit = vi.fn();
  const shutdown = createShutdown({
    app: {
      close: options.appClose ?? (async () => {
        calls.push("app.close");
      }),
    },
    prisma: {
      disconnect:
        options.disconnect ??
        (async () => {
          calls.push("prisma.disconnect");
        }),
    },
    logger,
    exit,
    timeoutMs: options.timeoutMs ?? 1000,
  });
  return { calls, logger, exit, shutdown };
}

describe("shutdown", () => {
  it("closes the app, then disconnects Prisma, then exits 0", async () => {
    const { calls, exit, logger, shutdown } = setup();

    await shutdown("SIGTERM");

    expect(calls).toEqual(["app.close", "prisma.disconnect"]);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(logger.info).toHaveBeenNthCalledWith(1, { signal: "SIGTERM", timeoutMs: 1000 }, "shutdown started");
    expect(logger.info).toHaveBeenNthCalledWith(2, { signal: "SIGTERM" }, "shutdown complete");
  });

  it("exits non-zero when in-flight work outlasts the timeout", async () => {
    const { calls, exit, logger, shutdown } = setup({ appClose: () => new Promise<void>(() => undefined), timeoutMs: 20 });

    await shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(calls).not.toContain("prisma.disconnect");
    expect(logger.error).toHaveBeenCalledExactlyOnceWith({ signal: "SIGTERM", timeoutMs: 20 }, "shutdown timed out, exiting");
  });

  it("exits non-zero and logs the error when disconnecting Prisma fails", async () => {
    const failure = new Error("disconnect failed");
    const { exit, logger, shutdown } = setup({ disconnect: () => Promise.reject(failure) });

    await shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith({ err: failure, signal: "SIGTERM" }, "shutdown failed");
  });

  it("exits non-zero when closing fails", async () => {
    const { exit, logger, shutdown } = setup({ appClose: () => Promise.reject(new Error("close failed")) });

    await shutdown("SIGINT");

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), expect.any(String));
  });

  it("runs once when signalled twice", async () => {
    const { calls, exit, shutdown } = setup();

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

    expect(calls).toEqual(["app.close", "prisma.disconnect"]);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

describe("bindShutdownSignals", () => {
  it("keeps listening after the first signal, so a second one reaches the shutdown guard", async () => {
    const processLike = new EventEmitter();
    const { calls, exit, shutdown } = setup();
    const handler = vi.fn((signal: string) => shutdown(signal));
    bindShutdownSignals(processLike, handler);

    processLike.emit("SIGTERM");
    processLike.emit("SIGINT");
    await Promise.all(handler.mock.results.map((result) => result.value));

    expect(handler.mock.calls).toEqual([["SIGTERM"], ["SIGINT"]]);
    expect(processLike.listenerCount("SIGTERM")).toBe(1);
    expect(processLike.listenerCount("SIGINT")).toBe(1);
    expect(calls).toEqual(["app.close", "prisma.disconnect"]);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
