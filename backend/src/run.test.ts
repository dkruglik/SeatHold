import { describe, expect, it } from "vitest";
import { run, type RunIo, type Runtime } from "./run.js";

const password = "s3cr3t-pass";
const env = { AUTH_CODE_PEPPER: "unit-test-pepper-0123456789-abcdefghij", CSRF_SECRET: "unit-test-csrf-secret-0123456789-abcdef", DATABASE_URL: `postgresql://dbuser:${password}@db.internal:5432/seatholder`, BACKEND_HOST: "127.0.0.1", BACKEND_PORT: "4010" };

type Handler = () => void;

class Harness {
  readonly stderr: string[] = [];
  readonly exits: number[] = [];
  readonly handlers = new Map<string, Handler>();
  readonly calls: string[] = [];
  readonly listened: Array<{ host: string; port: number }> = [];
  connect: () => Promise<void> = () => Promise.resolve();
  listen: () => Promise<void> = () => Promise.resolve();

  readonly io: RunIo = {
    stderr: { write: (text) => void this.stderr.push(text) },
    exit: (code) => void this.exits.push(code),
    signals: { on: (signal, listener) => void this.handlers.set(signal, listener) },
  };

  readonly runtime = (): Runtime => ({
    prisma: {
      connect: () => this.connect(),
      disconnect: () => {
        this.calls.push("disconnect");
        return Promise.resolve();
      },
    },
    app: {
      log: { info: () => undefined, error: () => undefined },
      close: () => {
        this.calls.push("close");
        return Promise.resolve();
      },
      listen: (options) => {
        this.listened.push(options);
        return this.listen();
      },
    },
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("run: configuration failure", () => {
  it("exits 1 and names the variable without its value", async () => {
    const h = new Harness();

    await run({ ...env, BACKEND_PORT: "abc" }, h.io, h.runtime);

    expect(h.exits).toEqual([1]);
    expect(h.stderr.join("")).toContain("BACKEND_PORT");
    expect(h.stderr.join("")).not.toContain("abc");
    expect(h.listened).toEqual([]);
  });
});

describe("run: startup failure", () => {
  it("prints a fixed line with the error class and code, never the message", async () => {
    const h = new Harness();
    h.connect = () => Promise.reject(Object.assign(new TypeError(`connect failed for ${env.DATABASE_URL}`), { code: "ECONNREFUSED" }));

    await run(env, h.io, h.runtime);

    expect(h.exits).toEqual([1]);
    expect(h.stderr.join("")).toBe("Startup failed: TypeError (code ECONNREFUSED)\n");
    expect(h.stderr.join("")).not.toContain(password);
  });

  it("prints only the class name when the error has no code", async () => {
    const h = new Harness();
    h.listen = () => Promise.reject(new Error(`bind failed ${password}`));

    await run(env, h.io, h.runtime);

    expect(h.stderr.join("")).toBe("Startup failed: Error\n");
    expect(h.exits).toEqual([1]);
  });
});

describe("run: signals and happy path", () => {
  it("binds SIGTERM and SIGINT and listens on the configured host and port", async () => {
    const h = new Harness();

    await run(env, h.io, h.runtime);

    expect([...h.handlers.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);
    expect(h.listened).toEqual([{ host: "127.0.0.1", port: 4010 }]);
    expect(h.exits).toEqual([]);
  });

  it("shuts down once when a signal arrives before listen completes, without a startup failure", async () => {
    const h = new Harness();
    let finishConnect: () => void = () => undefined;
    h.connect = () => new Promise<void>((resolve) => void (finishConnect = resolve));
    const running = run(env, h.io, h.runtime);
    await settle();

    h.handlers.get("SIGTERM")?.();
    h.handlers.get("SIGINT")?.();
    finishConnect();
    await running;
    await settle();

    expect(h.calls).toEqual(["close", "disconnect"]);
    expect(h.exits).toEqual([0]);
    expect(h.stderr).toEqual([]);
    expect(h.listened).toEqual([]);
  });
});
