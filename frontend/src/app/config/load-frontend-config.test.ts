import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { frontendVariableNames, loadFrontendConfig } from "./load-frontend-config";

describe("loadFrontendConfig", () => {
  it("defaults the API base to the same-origin /api", () => {
    expect(loadFrontendConfig({})).toEqual({ apiBaseUrl: "/api", seatPollIntervalMs: 3000 });
  });

  it("treats an empty value as unset", () => {
    expect(loadFrontendConfig({ VITE_API_BASE_URL: "" })).toEqual({ apiBaseUrl: "/api", seatPollIntervalMs: 3000 });
  });

  it.each(["/api", "/service/api"])("accepts VITE_API_BASE_URL=%s", (value) => {
    expect(loadFrontendConfig({ VITE_API_BASE_URL: value }).apiBaseUrl).toBe(value);
  });

  it("drops a trailing slash so paths join cleanly", () => {
    expect(loadFrontendConfig({ VITE_API_BASE_URL: "/api/" }).apiBaseUrl).toBe("/api");
  });

  it.each(["api", "ftp://example.com", "//example.com/api", "javascript:alert(1)", "http://localhost:3001", "https://seats.example.com/api"])("rejects VITE_API_BASE_URL=%s by name only", (value) => {
    expect(() => loadFrontendConfig({ VITE_API_BASE_URL: value })).toThrowError(/VITE_API_BASE_URL/);
    expect(() => loadFrontendConfig({ VITE_API_BASE_URL: value })).not.toThrowError(value);
  });

  it("defaults the seat poll interval to 3000 ms", () => {
    expect(loadFrontendConfig({}).seatPollIntervalMs).toBe(3000);
    expect(loadFrontendConfig({ VITE_SEAT_POLL_INTERVAL_MS: "" }).seatPollIntervalMs).toBe(3000);
  });

  it("reads a valid VITE_SEAT_POLL_INTERVAL_MS", () => {
    expect(loadFrontendConfig({ VITE_SEAT_POLL_INTERVAL_MS: "5000" }).seatPollIntervalMs).toBe(5000);
  });

  it.each(["0", "-1", "1.5", "abc", "1e3"])("rejects VITE_SEAT_POLL_INTERVAL_MS=%s by name only", (value) => {
    expect(() => loadFrontendConfig({ VITE_SEAT_POLL_INTERVAL_MS: value })).toThrowError(
      "Invalid configuration: VITE_SEAT_POLL_INTERVAL_MS must be a positive integer",
    );
    expect(() => loadFrontendConfig({ VITE_SEAT_POLL_INTERVAL_MS: value })).not.toThrowError(new RegExp(`=${value}`));
  });

  it("returns a frozen config", () => {
    expect(Object.isFrozen(loadFrontendConfig({}))).toBe(true);
  });

  it("is documented in .env.example", () => {
    const example = readFileSync(resolve(process.cwd(), "../.env.example"), "utf8");

    for (const name of frontendVariableNames) {
      expect(example).toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});
