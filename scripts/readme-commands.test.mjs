import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(path.join(rootDir, "README.md"), "utf8");
const scripts = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")).scripts;

describe("README.md", () => {
  it("names at least the core npm scripts", () => {
    const named = new Set([...readme.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]));
    for (const core of ["dev", "verify", "verify-fast-part", "verify-slow-part", "db:generate"]) {
      assert.ok(named.has(core), `README does not mention npm run ${core}`);
    }
  });

  it("only names npm scripts that exist in the root package.json", () => {
    for (const [, name] of readme.matchAll(/npm run ([\w:-]+)/g)) {
      assert.ok(name in scripts, `npm run ${name} is not a root script`);
    }
  });

  it("contains no email address", () => {
    assert.equal(/[\w.+-]+@[\w-]+\.[\w.-]+/.test(readme), false);
  });

  it("contains no IPv4 address other than 127.0.0.1", () => {
    const found = (readme.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) ?? []).filter((ip) => ip !== "127.0.0.1");
    assert.deepEqual(found, []);
  });
});
