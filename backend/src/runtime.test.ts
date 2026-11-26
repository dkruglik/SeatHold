import { describe, expect, it } from "vitest";
import { loadConfig } from "./config/load-config.js";
import { createDefaultRuntime } from "./runtime.js";

describe("createDefaultRuntime", () => {
  it("wires the auth routes into the app without touching the database", async () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      AUTH_CODE_PEPPER: "runtime-test-pepper-0123456789-abcdefgh",
      LOG_LEVEL: "silent",
    });
    const { app } = createDefaultRuntime(config);

    const response = await app.inject({ method: "POST", url: "/api/auth/logout" });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });
});
