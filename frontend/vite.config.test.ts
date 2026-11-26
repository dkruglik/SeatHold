import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vite from "vite";
import viteConfig, { createViteConfig, loadViteConfig } from "./vite.config";

vi.mock("vite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vite")>();
  return { ...actual, loadEnv: vi.fn(actual.loadEnv) };
});

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("vite dev server", () => {
  it("serves on 5173 and proxies /api to the backend on 127.0.0.1:3001 by default", () => {
    const config = createViteConfig({});

    expect(config.server?.port).toBe(5173);
    expect(config.server?.proxy).toMatchObject({ "/api": { target: "http://127.0.0.1:3001" } });
  });

  it("takes the backend port from BACKEND_PORT", () => {
    const config = createViteConfig({ BACKEND_PORT: "4555" });

    expect(config.server?.proxy).toMatchObject({ "/api": { target: "http://127.0.0.1:4555" } });
  });

  it.each(["abc", "0", "70000", "3001.5"])("rejects BACKEND_PORT=%s by name only", (value) => {
    expect(() => createViteConfig({ BACKEND_PORT: value })).toThrowError(/BACKEND_PORT/);
    expect(() => createViteConfig({ BACKEND_PORT: value })).not.toThrowError(value);
  });
});

describe("vite dev server env file", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), "seatholder-vite-"));
    vi.stubEnv("BACKEND_PORT", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(rootDir, { recursive: true, force: true });
  });

  it("reaches the proxy target from a BACKEND_PORT in the root env file", () => {
    writeFileSync(path.join(rootDir, ".env"), "BACKEND_PORT=4777\n");

    const config = loadViteConfig("development", rootDir);

    expect(config.server?.proxy).toMatchObject({ "/api": { target: "http://127.0.0.1:4777" } });
  });

  it("reads the repository root, not the working directory, in the default export", () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(rootDir);
    const configFn = viteConfig as (env: { mode: string; command: "serve" }) => unknown;

    configFn({ mode: "development", command: "serve" });

    expect(vi.mocked(vite.loadEnv)).toHaveBeenLastCalledWith("development", repositoryRoot, "BACKEND_");
    cwd.mockRestore();
  });
});
