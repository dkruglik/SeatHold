import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { devSpawnSpecs } from "./dev.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("devSpawnSpecs", () => {
  it("runs the backend through tsx watch with the repository .env", () => {
    const { backend } = devSpawnSpecs(rootDir);

    assert.equal(path.basename(backend.args[0]), "cli.mjs");
    assert.deepEqual(backend.args.slice(1), ["watch", "--env-file-if-exists=../.env", "src/server.ts"]);
    assert.equal(backend.cwd, path.join(rootDir, "backend"));
    assert.equal(backend.file, process.execPath);
  });

  it("runs the frontend through the vite CLI", () => {
    const { frontend } = devSpawnSpecs(rootDir);

    assert.equal(path.basename(frontend.args[0]), "vite.js");
    assert.equal(frontend.cwd, path.join(rootDir, "frontend"));
  });
});