import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { frontendVariableNames, loadFrontendConfig } from "./load-frontend-config";

describe("loadFrontendConfig", () => {
  it("defaults the API base to the same-origin /api", () => {
    expect(loadFrontendConfig({})).toEqual({ apiBaseUrl: "/api" });
  });

  it("treats an empty value as unset", () => {
    expect(loadFrontendConfig({ VITE_API_BASE_URL: "" })).toEqual({ apiBaseUrl: "/api" });
  });

  it.each(["/api", "/service/api", "http://localhost:3001", "https://seats.example.com/api"])("accepts VITE_API_BASE_URL=%s", (value) => {
    expect(loadFrontendConfig({ VITE_API_BASE_URL: value }).apiBaseUrl).toBe(value);
  });

  it("drops a trailing slash so paths join cleanly", () => {
    expect(loadFrontendConfig({ VITE_API_BASE_URL: "http://localhost:3001/" }).apiBaseUrl).toBe("http://localhost:3001");
  });

  it.each(["api", "ftp://example.com", "//example.com/api", "javascript:alert(1)"])("rejects VITE_API_BASE_URL=%s by name only", (value) => {
    expect(() => loadFrontendConfig({ VITE_API_BASE_URL: value })).toThrowError(/VITE_API_BASE_URL/);
    expect(() => loadFrontendConfig({ VITE_API_BASE_URL: value })).not.toThrowError(value);
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
