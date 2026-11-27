import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const featuresDir = join(import.meta.dirname, "..", "..", "features");
const mantineImport = /(?:from|import)\s*\(?\s*["']@mantine\//;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("feature code uses the shared UI layer", () => {
  it("never imports @mantine/* directly under features/ (tests included; they use src/test helpers)", () => {
    const offenders = sourceFiles(featuresDir)
      .filter((file) => mantineImport.test(readFileSync(file, "utf8")))
      .map((file) => relative(featuresDir, file))
      .sort();

    expect(offenders).toEqual([]);
  });
});
