import { describe, expect, it } from "vitest";
import { loadConfig } from "./config/load-config.js";
import { createDefaultRuntime } from "./runtime.js";

describe("createDefaultRuntime", () => {
  it("wires the auth routes into the app without touching the database", async () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      AUTH_CODE_PEPPER: "runtime-test-pepper-0123456789-abcdefgh",
      CSRF_SECRET: "runtime-test-csrf-secret-0123456789-abcd",
      LOG_LEVEL: "silent",
    });
    const { app } = createDefaultRuntime(config);

    const csrf = await app.inject({ method: "GET", url: "/api/auth/csrf" });
    const cookie = `csrf_secret=${csrf.cookies.find((candidate) => candidate.name === "csrf_secret")?.value ?? ""}`;
    const headers = { origin: "http://localhost:5173", cookie, "x-csrf-token": (csrf.json() as { csrfToken: string }).csrfToken };
    const response = await app.inject({ method: "POST", url: "/api/auth/logout", headers });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });
});
