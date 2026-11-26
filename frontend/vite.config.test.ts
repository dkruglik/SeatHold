import { describe, expect, it } from "vitest";
import { createViteConfig } from "./vite.config";

describe("vite dev server", () => {
  it("serves on 5173 and proxies /api to the backend on 127.0.0.1:3001 by default", () => {
    const config = createViteConfig({});

    expect(config.server?.port).toBe(5173);
    expect(config.server?.proxy).toEqual({ "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } });
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
