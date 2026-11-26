import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { resolveNpmJsCli, spawnCommandLine, spawnFailureMessage } from "./spawn-command-line.mjs";

const options = { cwd: process.cwd(), env: process.env };

describe("spawnFailureMessage", () => {
  it("names the command when it never started, and is null when it ran", () => {
    const missing = new Error("spawnSync docker ENOENT");

    assert.equal(spawnFailureMessage("docker", { status: null, error: missing }), "Could not run docker: spawnSync docker ENOENT");
    assert.equal(spawnFailureMessage("docker", { status: 1, error: undefined }), null);
    assert.equal(spawnFailureMessage("docker", { status: 0, error: undefined }), null);
  });
});

describe("spawnCommandLine", () => {
  it("returns the exit code of the command", () => {
    assert.equal(spawnCommandLine([process.execPath, "-e", "process.exit(3)"], options), 3);
    assert.equal(spawnCommandLine([process.execPath, "-e", "process.exit(0)"], options), 0);
  });

  it("passes arguments that contain spaces through intact", () => {
    const script = "process.exit(process.argv[1] === 'a b' ? 0 : 9)";

    assert.equal(spawnCommandLine([process.execPath, "-e", script, "a b"], options), 0);
  });

  it("returns 1 for a command that never started", () => {
    assert.equal(spawnCommandLine(["seatholder-no-such-command-xyz"], options), 1);
  });
});

describe("resolveNpmJsCli", () => {
  it("resolves npm and npx JavaScript CLIs next to Node", () => {
    assert.match(resolveNpmJsCli("npm"), /npm-cli\.js$/);
    assert.match(resolveNpmJsCli("npx"), /npx-cli\.js$/);
    assert.equal(fs.existsSync(resolveNpmJsCli("npm")), true);
    assert.equal(fs.existsSync(resolveNpmJsCli("npx")), true);
  });
});
