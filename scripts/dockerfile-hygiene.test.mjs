import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(rootDir, file), "utf8");

// Instructions only: comments and blank lines dropped, line continuations joined.
function instructions(file) {
  return read(file)
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

const dockerfile = "backend/Dockerfile";

function stages() {
  const result = [];
  for (const line of instructions(dockerfile)) {
    if (/^FROM\s/i.test(line)) result.push({ from: line, lines: [] });
    else result.at(-1)?.lines.push(line);
  }
  return result;
}

describe("backend/Dockerfile", () => {
  it("exists and is multi-stage", () => {
    assert.ok(fs.existsSync(path.join(rootDir, dockerfile)));
    assert.ok(stages().length >= 3);
  });

  it("pins every base image to an exact tag and a digest, never latest", () => {
    for (const { from } of stages()) {
      const image = from.split(/\s+/)[1];
      if (stages().some((stage) => new RegExp(`\\sAS\\s+${image}$`, "i").test(stage.from))) continue;
      assert.match(image, /^node:\d+\.\d+\.\d+-alpine\d+\.\d+@sha256:[0-9a-f]{64}$/, from);
      assert.ok(!/:latest\b/.test(image));
    }
  });

  it("runs the final stage as a non-root user", () => {
    const users = stages().at(-1).lines.filter((line) => /^USER\s/i.test(line));
    assert.ok(users.length > 0);
    assert.ok(!/^USER\s+(root|0)(\s|:|$)/i.test(users.at(-1)));
  });

  it("declares a HEALTHCHECK on the health endpoint in the final stage", () => {
    const health = stages().at(-1).lines.find((line) => /^HEALTHCHECK\s/i.test(line));
    assert.ok(health);
    assert.match(health, /\/api\/health/);
    assert.ok(!/\bcurl\b/.test(health));
  });

  it("listens on all interfaces in the container, whatever the .env example says for the host", () => {
    assert.ok(stages().at(-1).lines.includes("ENV BACKEND_HOST=0.0.0.0"));
  });

  it("starts node directly so it receives SIGTERM, in exec form", () => {
    const cmd = stages().at(-1).lines.find((line) => /^CMD\s/i.test(line));
    assert.match(cmd, /^CMD \["node", /i);
  });

  it("installs production dependencies only in the final stage", () => {
    const installs = stages().at(-1).lines.filter((line) => /\bnpm (ci|install)\b/.test(line));
    assert.ok(installs.length > 0);
    assert.ok(installs.every((line) => line.includes("--omit=dev")));
  });

  it("never copies env files or the whole context, and sets no secret", () => {
    const all = instructions(dockerfile);
    assert.ok(all.every((line) => !/\.env/.test(line)));
    assert.ok(all.every((line) => !/^COPY\s+(--\S+\s+)*\.\s+\S+/i.test(line)));
    assert.ok(all.every((line) => !/^(ENV|ARG)\s+\S*(SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL)/i.test(line)));
    assert.ok(all.every((line) => !/\b(curl|apk add)\b/.test(line)));
  });
});

describe(".dockerignore", () => {
  const entries = () => read(".dockerignore").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

  it("keeps secrets, history and local state out of the build context", () => {
    for (const entry of [".env*", ".git", "**/node_modules", "**/dist", "coverage", ".agent-*"]) {
      assert.ok(entries().includes(entry), `missing ${entry}`);
    }
    assert.ok(!entries().some((entry) => entry.startsWith("!.env")));
  });
});
