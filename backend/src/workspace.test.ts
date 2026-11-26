import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workspaceName } from "./index.js";

describe("backend workspace", () => {
  it("exports the name declared in its package.json", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { name: string };

    expect(workspaceName).toBe(manifest.name);
  });
});
