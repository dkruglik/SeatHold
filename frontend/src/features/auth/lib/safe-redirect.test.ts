import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each(["/", "/admin", "/events/42?tab=seats#top"])("keeps the same-origin path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "//evil.example/path",
    "https://evil.example",
    "http://evil.example/x",
    "javascript:alert(1)",
    "/\\evil.example",
    "\\\\evil.example",
    "evil",
    "",
    "/ok\nHost: evil",
    "/login",
    "/login?x=1",
    42,
    null,
    undefined,
    { pathname: "/x" },
  ])("falls back to / for %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });
});
