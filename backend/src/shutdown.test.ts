import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "./shutdown.js";

function setup(options: { appClose?: () => Promise<void>; timeoutMs?: number } = {}) {
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
      disconnect: async () => {
        calls.push("prisma.disconnect");
      },
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
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ signal: "SIGTERM" }), expect.stringContaining("shutdown"));
  });

  it("exits non-zero when in-flight work outlasts the timeout", async () => {
    const { calls, exit, logger, shutdown } = setup({ appClose: () => new Promise<void>(() => undefined), timeoutMs: 20 });

    await shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(calls).not.toContain("prisma.disconnect");
    expect(logger.error).toHaveBeenCalled();
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
