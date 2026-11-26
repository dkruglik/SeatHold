import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  timingsEnabled,
} from "./verify-timing.mjs";
import {
  formatVerifySummary,
  parseVerifyArgs,
  verifyEnv,
  verifySteps,
} from "./verify.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

// The commands of every `run:` step in .github/workflows/ci.yml, single-line or block scalar, in file order.
function workflowCommands() {
  const lines = read(".github/workflows/ci.yml").split(/\r?\n/);
  const commands = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    if (!/^[|>][+-]?$/.test(match[2])) {
      commands.push(match[2].trim());
      continue;
    }
    for (i += 1; i < lines.length && (lines[i].trim() === "" || /^\s/.test(lines[i]) && lines[i].search(/\S/) > match[1].length); i += 1) {
      if (lines[i].trim() !== "") commands.push(lines[i].trim());
    }
    i -= 1;
  }
  return commands;
}

const imageBuildCommand = "docker buildx build --platform linux/amd64,linux/arm64 -f backend/Dockerfile .";
const imageSmokeBuildCommand = "docker build -f backend/Dockerfile -t seatholder-backend:ci .";
const imageSmokeCommand = "node scripts/image-smoke.mjs seatholder-backend:ci";

function stepCommandLines() {
  return verifySteps().map((step) => step.label);
}

// A root script runs its `&&` segments in order; verify times each segment as one step.
function rootScriptSegments(name) {
  const scripts = JSON.parse(read("package.json")).scripts;
  return scripts[name].split("&&").map((segment) => segment.trim());
}

describe("verifySteps", () => {
  it("runs exactly the commands the GitHub workflow runs", () => {
    // The workflow starts PostgreSQL as a service (db:start) and installs with npm ci; the security step is
    // one command locally and two in CI (semgrep in its own image, plus the audit check).
    // The multi-arch image build and the image smoke job are CI-only exceptions (see "image build job" and
    // "image smoke job"): they need buildx and QEMU, or Docker and a database service.
    const ciOnly = new Set(["npm ci", "node scripts/security-scan.mjs --check audit", imageBuildCommand, imageSmokeBuildCommand, imageSmokeCommand]);
    const expand = (command) => {
      const script = /^npm run (lint|typecheck|test|build)$/.exec(command)?.[1];
      return script ? rootScriptSegments(script) : [command];
    };
    const ci = workflowCommands()
      .filter((command) => !ciOnly.has(command) && !command.startsWith("semgrep "))
      .flatMap(expand);
    const local = stepCommandLines().filter((line) => line !== "npm run db:start");

    assert.deepEqual([...new Set(ci)].sort(), [...new Set(local.filter((line) => line !== "node scripts/security-scan.mjs"))].sort());
    assert.ok(workflowCommands().includes("npm ci"));
    assert.ok(workflowCommands().includes("node scripts/security-scan.mjs --check audit"));
    assert.ok(workflowCommands().some((command) => command.startsWith("semgrep scan ")));
  });

  it("times backend and frontend as separate steps, each tagged with its scope", () => {
    const steps = verifySteps();
    const scopeOf = (label) => steps.find((step) => step.label === label)?.scope;

    assert.equal(scopeOf("npm run lint -w backend"), "backend");
    assert.equal(scopeOf("npm run typecheck -w frontend"), "frontend");
    assert.equal(scopeOf("node scripts/sync-ai-rules.mjs --check"), "root");
    assert.ok(steps.every((step) => typeof step.scope === "string"));
  });

  it("runs the backend integration step through the throwaway test database, as root test does", () => {
    assert.ok(stepCommandLines().includes("node scripts/test-db.mjs run -- npm run test:integration -w backend"));
  });

  it("runs both security checks, which cover the semgrep and audit steps of CI", () => {
    assert.ok(workflowCommands().includes("node scripts/security-scan.mjs --check audit"));
    assert.ok(stepCommandLines().includes("node scripts/security-scan.mjs"));
  });

  it("starts Postgres for tests and never deploys the app database migration or frontend", () => {
    const lines = stepCommandLines();
    assert.ok(lines.indexOf("npm run db:start") < lines.indexOf(rootScriptSegments("test")[0]));
    assert.ok(!lines.includes("npm run db:migrate:deploy -w backend"));
    assert.ok(lines.every((line) => !/deploy:frontend|pages:deploy|release\.mjs|wrangler/.test(line)));
  });

  it("leaves db:start out only when asked, for a database that is already running", () => {
    assert.equal(stepCommandLines()[0], "npm run db:start");
    const lines = verifySteps({ startDb: false }).map((step) => step.label);
    assert.ok(!lines.includes("npm run db:start"));
    assert.deepEqual(lines, stepCommandLines().slice(1));
  });
});

describe("image build job", () => {
  it("builds the backend image for amd64 and arm64 in CI without pushing, and verify does not run it", () => {
    const builds = workflowCommands().filter((command) => command.includes("docker buildx"));
    assert.deepEqual(builds, [imageBuildCommand]);
    assert.ok(!/--push|--load|push:\s*true/.test(read(".github/workflows/ci.yml")));
    assert.ok(stepCommandLines().every((line) => !line.includes("buildx")));
  });

  it("sets up QEMU and Buildx with actions pinned by full commit SHA", () => {
    const workflow = read(".github/workflows/ci.yml");
    assert.match(workflow, /uses: docker\/setup-qemu-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
    assert.match(workflow, /uses: docker\/setup-buildx-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
  });
});

describe("image smoke job", () => {
  const workflow = () => read(".github/workflows/ci.yml");
  const job = () => /^  image-smoke:\n([\s\S]*?)(?=^  \S)/m.exec(workflow())?.[1] ?? "";

  it("builds the image for amd64 only, tagged for the smoke script, and runs the script; verify does not", () => {
    assert.ok(job() !== "");
    const commands = workflowCommands().filter((command) => command.includes("image-smoke") || command.startsWith("docker build "));
    assert.deepEqual(commands, [imageSmokeBuildCommand, imageSmokeCommand]);
    assert.ok(stepCommandLines().every((line) => !line.includes("image-smoke") && !line.startsWith("docker build")));
  });

  it("starts a postgres:17.12 service and passes the script its database URL", () => {
    assert.match(job(), /image: postgres:17\.12/);
    assert.match(job(), /IMAGE_SMOKE_DATABASE_URL: postgresql:\/\/seatholder:seatholder@127\.0\.0\.1:5432\/seatholder/);
  });

  it("pins its actions by full commit SHA", () => {
    const uses = [...job().matchAll(/uses: (\S+)/g)].map((match) => match[1]);
    assert.ok(uses.length > 0);
    for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/);
  });

  it("never pushes", () => {
    assert.ok(!/push/.test(job().replace(/Never pushed|never pushed/g, "")));
  });
});

describe("timing feature flag", () => {
  it("runs the plain root scripts, one command each, when timings are off", () => {
    assert.deepEqual(
      verifySteps({ timed: false }).map((step) => step.label),
      [
        "npm run db:start",
        "npm run db:generate",
        "npm run lint",
        "npm run typecheck",
        "npm run test",
        "npm run build",
        "node scripts/security-scan.mjs",
      ],
    );
  });

  it("splits steps by workspace only when the flag is on", () => {
    const split = verifySteps().some((step) => step.label === "npm run lint -w backend");
    assert.equal(split, timingsEnabled);
  });
});

describe("verifyEnv", () => {
  it("builds like CI and fills only the values that are missing", () => {
    const env = verifyEnv({ VITE_API_BASE_URL: "/service/api" });

    assert.equal(env.APP_ENV, "production");
    assert.equal(env.VITE_API_BASE_URL, "/service/api");
    assert.equal(env.DATABASE_URL, "postgresql://seatholder:seatholder@localhost:5432/seatholder");
    assert.ok(!Object.values(env).some((value) => /replace_me/i.test(String(value))));
  });

  it("sets no LEGAL_ variable, in verify or in CI, because nothing reads one", () => {
    assert.ok(!Object.keys(verifyEnv({})).some((name) => name.startsWith("LEGAL_")));
    assert.ok(!/LEGAL_/.test(read(".github/workflows/ci.yml")));
  });
});

describe("formatVerifySummary", () => {
  it("lists each step with its result and stops the list at the first failure", () => {
    const summary = formatVerifySummary([
      { label: "npm run lint", ok: true, seconds: 12.3 },
      { label: "npm run test", ok: false, seconds: 40 },
    ]);

    assert.match(summary, /PASS\s+npm run lint\s+12s/);
    assert.match(summary, /FAIL\s+npm run test\s+40s/);
    assert.match(summary, /verify failed/);
  });

  it("reports success when every step passed", () => {
    assert.match(formatVerifySummary([{ label: "npm run lint", ok: true, seconds: 1 }]), /verify passed/);
  });
});

describe("verify parts", () => {
  const labels = (options) => verifySteps(options).map((step) => step.label);
  const fullIntegration = "node scripts/test-db.mjs run -- npm run test:integration -w backend";
  const fastIntegration = "node scripts/test-db.mjs run -- npm run test:integration:fast -w backend";
  const slowIntegration = "node scripts/test-db.mjs run -- npm run test:integration:slow -w backend";

  it("runs every full step in the fast part, except that integration tests skip the slow files", () => {
    const expected = labels({}).map((label) => (label === fullIntegration ? fastIntegration : label));
    assert.deepEqual(labels({ part: "fast" }), expected);
  });

  it("runs only the database steps and the slow integration files in the slow part", () => {
    assert.deepEqual(labels({ part: "slow" }), ["npm run db:start", "npm run db:generate", slowIntegration]);
  });

  it("drops db:start in every part when the database is already running", () => {
    for (const part of ["full", "fast", "slow"]) {
      assert.ok(!labels({ part, startDb: false }).includes("npm run db:start"), part);
    }
  });

  it("splits the test script in the fast part even when timings are off", () => {
    const lines = labels({ part: "fast", timed: false });
    assert.ok(lines.includes(fastIntegration));
    assert.ok(!lines.includes("npm run test"));
    assert.ok(lines.includes("npm run lint"));
  });

  it("rejects an unknown part", () => {
    assert.throws(() => verifySteps({ part: "medium" }), /unknown verify part/i);
  });

  it("names the part in the verdict, and keeps the full verdict as it was", () => {
    const ok = [{ label: "x", ok: true, seconds: 1 }];
    const bad = [{ label: "x", ok: false, seconds: 1 }];
    assert.match(formatVerifySummary(ok, "fast"), /verify-fast-part passed/);
    assert.match(formatVerifySummary(bad, "slow"), /verify-slow-part failed at: x/);
    assert.match(formatVerifySummary(ok), /^verify passed$/m);
  });
});

describe("part scripts", () => {
  const rootScripts = () => JSON.parse(read("package.json")).scripts;
  const backendScripts = () => JSON.parse(read("backend/package.json")).scripts;

  it("exposes the fast and slow parts of verify at the root", () => {
    assert.equal(rootScripts()["verify-fast-part"], "node scripts/verify.mjs --part fast");
    assert.equal(rootScripts()["verify-slow-part"], "node scripts/verify.mjs --part slow");
  });

  it("selects integration files by the *.slow.test.ts naming convention", () => {
    assert.match(backendScripts()["test:integration:fast"], /--project integration/);
    // Double quotes: cmd.exe on Windows does not strip single quotes, and sh does not expand the glob.
    assert.match(backendScripts()["test:integration:fast"], /--exclude "\*\*\/\*\.slow\.test\.ts"/);
    assert.match(backendScripts()["test:integration:slow"], /--project integration \.slow\.test\.ts$/);
    assert.equal(backendScripts()["test:integration"], "vitest run --project integration");
  });
});

describe("slow file naming", () => {
  function filesUnder(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? filesUnder(full) : [full];
    });
  }

  it("ends every file named *.slow.test.* with .slow.test.ts, so none matches both or neither selection", () => {
    const odd = filesUnder(path.join(rootDir, "backend", "src")).filter((file) => {
      const name = path.basename(file);
      return name.includes(".slow.test.") && !name.endsWith(".slow.test.ts");
    });
    assert.deepEqual(odd, []);
  });

  it("keeps .slow.test. out of the repository path, because the slow filter matches the whole path", () => {
    assert.ok(!rootDir.includes(".slow.test."));
  });
});

describe("parseVerifyArgs", () => {
  it("defaults to the full verify with a database start", () => {
    assert.deepEqual(parseVerifyArgs([]), { part: "full", startDb: true });
  });

  it("reads --part and --skip-db-start", () => {
    assert.deepEqual(parseVerifyArgs(["--part", "fast", "--skip-db-start"]), { part: "fast", startDb: false });
  });

  it("rejects the removed --ci-local flag instead of ignoring it", () => {
    assert.throws(() => parseVerifyArgs(["--ci-local"]), /Unknown argument: --ci-local/);
  });

  it("rejects --part without a value or with an unknown value", () => {
    assert.throws(() => parseVerifyArgs(["--part"]), /Unknown verify part ""; use --part full\|fast\|slow/);
    assert.throws(() => parseVerifyArgs(["--part", "bogus"]), /Unknown verify part "bogus"; use --part full\|fast\|slow/);
  });
});
