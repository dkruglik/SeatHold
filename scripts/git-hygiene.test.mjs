import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// `git check-ignore` exits 0 when the path is ignored and 1 when it is not.
function isIgnored(relativePath) {
  const result = spawnSync("git", ["check-ignore", "-q", "--no-index", "--", relativePath], { cwd: rootDir });
  assert.ok(result.status === 0 || result.status === 1, `git check-ignore failed for ${relativePath}`);
  return result.status === 0;
}

describe("git hygiene", () => {
  for (const file of [
    ".claude/skills/install-seathold/SKILL.md",
    "scripts/verify.mjs",
    ".env.example",
  ]) {
    it(`tracks ${file} (not ignored)`, () => {
      assert.equal(isIgnored(file), false);
    });
  }

  for (const file of [
    ".env",
    ".env.manager",
    ".env.local",
    "CLAUDE.local.md",
    ".claude/rules/x.md",
    ".claude/marketplace/x",
    ".claude/settings.local.json",
    ".claude/skills/other/SKILL.md",
    ".cursor/x",
    "backend/src/generated/x",
    "node_modules/x",
  ]) {
    it(`ignores ${file}`, () => {
      assert.equal(isIgnored(file), true);
    });
  }

  it("has no .env.local.example, because nothing reads .env.local", () => {
    assert.equal(existsSync(path.join(rootDir, ".env.local.example")), false);
  });

  it("keeps CLAUDE.md standalone, without a pointer to AGENT.md", () => {
    const content = readFileSync(path.join(rootDir, "CLAUDE.md"), "utf8");
    assert.ok(!content.includes("AGENT.md"));
  });
});
