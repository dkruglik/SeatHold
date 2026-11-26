import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Git attributes that apply to a path, as git resolves them from .gitattributes.
function attributesOf(relativePath) {
  const output = execFileSync("git", ["check-attr", "text", "eol", "--", relativePath], { cwd: rootDir, encoding: "utf8" });
  return Object.fromEntries(
    output
      .trim()
      .split("\n")
      .map((line) => line.split(": ").slice(1)),
  );
}

// A Windows checkout with core.autocrlf=true would otherwise write CRLF to disk while CI sees LF, so tests that read
// files pass in CI and fail locally, and files built or uploaded from a Windows tree carry CRLF.
describe("line endings", () => {
  for (const file of [
    "backend/src/app.ts",
    "frontend/src/main.tsx",
    "package.json",
    "README.md",
  ]) {
    it(`checks out ${file} with LF on every platform`, () => {
      assert.deepEqual(attributesOf(file), { text: "auto", eol: "lf" });
    });
  }
});
