import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  timingsEnabled,
} from "./verify-timing.mjs";
import {
  ciLocalArgs,
  ciLocalEnv,
  ciLocalPrerequisiteError,
  ciLocalJobs,
  ciLocalVersion,
  formatVerifySummary,
  parseVerifyArgs,
  verifyEnv,
  verifySteps,
} from "./verify.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

// The script lines (`- npm run ...` / `- node ...`) of one top-level job in .gitlab-ci.yml.
function ciJobCommands(job) {
  const block = read(".gitlab-ci.yml").split(new RegExp(`^${job}:\\s*$`, "m"))[1] ?? "";
  const body = block.split(/^\S/m)[0];
  return [...body.matchAll(/^\s+- ((?:npm run|node) .+)$/gm)].map((match) => match[1].trim());
}

function stepCommandLines() {
  return verifySteps().map((step) => step.label);
}

// A root script runs its `&&` segments in order; verify times each segment as one step.
function rootScriptSegments(name) {
  const scripts = JSON.parse(read("package.json")).scripts;
  return scripts[name].split("&&").map((segment) => segment.trim());
}

describe("verifySteps", () => {
  it("runs every command of the GitLab verify jobs", () => {
    const lines = stepCommandLines();
    for (const job of ["lint-typecheck", "test", "build"]) {
      for (const command of ciJobCommands(job)) {
        const script = command.split(" ")[2];
        // Root scripts that verify splits into steps are checked segment by segment; the rest run as one step.
        const expected = ["lint", "typecheck", "test", "build"].includes(script) ? rootScriptSegments(script) : [command];
        for (const segment of expected) {
          assert.ok(lines.includes(segment), `npm run verify is missing "${segment}" from the ${job} job ("${command}")`);
        }
      }
    }
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

  it("runs both security checks, which cover the semgrep and audit jobs", () => {
    assert.deepEqual(ciJobCommands("security-audit"), ["node scripts/security-scan.mjs --check audit"]);
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
    const env = verifyEnv({ LEGAL_CONTACT_EMAIL: "legal@seatholder.example" });

    assert.equal(env.APP_ENV, "production");
    assert.equal(env.LEGAL_CONTACT_EMAIL, "legal@seatholder.example");
    assert.equal(env.LEGAL_OPERATOR_NAME, "Local Verify Operator");
    assert.equal(env.DATABASE_URL, "postgresql://seatholder:seatholder@localhost:5432/seatholder");
    assert.ok(!Object.values(env).some((value) => /replace_me/i.test(String(value))));
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

describe("gitlab-ci-local", () => {
  it("is pinned and runs exactly the verify jobs of .gitlab-ci.yml", () => {
    const ci = read(".gitlab-ci.yml");
    const jobs = [...ci.matchAll(/^([a-z][a-z0-9:-]*):\s*$/gm)]
      .map((match) => match[1])
      .filter((job) => !["workflow", "default", "variables", "stages"].includes(job));

    assert.deepEqual([...ciLocalJobs].sort(), jobs.filter((job) => !job.startsWith("deploy")).sort());
    assert.match(ciLocalVersion, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(ciLocalArgs().slice(0, 2), ["--yes", `gitlab-ci-local@${ciLocalVersion}`]);
    assert.ok(!ciLocalArgs().some((arg) => arg.startsWith("deploy")));
  });

  it("explains a missing rsync before starting, because gitlab-ci-local needs it on the host", () => {
    assert.match(ciLocalPrerequisiteError(() => false), /rsync/);
    assert.match(ciLocalPrerequisiteError(() => false), /WSL/);
    assert.equal(ciLocalPrerequisiteError(() => true), null);
  });

  it("skips only the test job on Windows, where gitlab-ci-local cannot name the service log file", () => {
    const jobsOn = (platform) => {
      const args = ciLocalArgs(platform);
      return args.flatMap((arg, index) => (arg === "--job" ? [args[index + 1]] : []));
    };

    assert.deepEqual(jobsOn("linux"), ciLocalJobs);
    assert.deepEqual(jobsOn("win32"), ciLocalJobs.filter((job) => job !== "test"));
  });

  it("keeps the cache in Docker, leaves the working tree alone, and pins the helper image", () => {
    const args = ciLocalArgs();

    assert.ok(args.includes("--mount-cache"));
    assert.ok(args.includes("--no-artifacts-to-source"));
    assert.match(args[args.indexOf("--helper-image") + 1], /^docker\.io\/firecow\/gitlab-ci-local-util@sha256:[a-f0-9]{64}$/);
  });

  it("stops Git Bash from rewriting container paths on Windows only", () => {
    assert.equal(ciLocalEnv({ PATH: "x" }, "win32", () => false).MSYS_NO_PATHCONV, "1");
    assert.equal(ciLocalEnv({ PATH: "x" }, "win32", () => false).PATH, "x");
    assert.equal(ciLocalEnv({ PATH: "x" }, "linux").MSYS_NO_PATHCONV, undefined);
  });

  it("drops the WindowsApps folder from PATH on Windows, where its bash.exe is a WSL launcher that cannot start", () => {
    const path = "C:\\Tools;C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\;C:\\Program Files\\Git\\usr\\bin";

    assert.equal(ciLocalEnv({ Path: path }, "win32", () => false).Path, "C:\\Tools;C:\\Program Files\\Git\\usr\\bin");
    assert.equal(ciLocalEnv({ PATH: path }, "linux").PATH, path);
  });

  it("puts Git for Windows' bash first on PATH on Windows, so gitlab-ci-local can start a shell", () => {
    const gitBash = "C:\\Program Files\\Git\\usr\\bin";
    const env = ciLocalEnv({ Path: "C:\\Tools", ProgramFiles: "C:\\Program Files" }, "win32", (file) => file === `${gitBash}\\bash.exe`);

    assert.equal(env.Path, `${gitBash};C:\\Tools`);
    assert.equal(ciLocalEnv({ Path: "C:\\Tools" }, "linux").Path, "C:\\Tools");
  });

  it("keeps the local variables file out of git", () => {
    const gitignore = read(".gitignore");
    assert.match(gitignore, /^\.gitlab-ci-local-variables\.yml$/m);
    assert.match(gitignore, /^\.gitlab-ci-local\/$/m);
    assert.ok(fs.existsSync(path.join(rootDir, ".gitlab-ci-local-variables.example.yml")));
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
    assert.deepEqual(parseVerifyArgs([]), { mode: "verify", part: "full", startDb: true });
  });

  it("reads --part and --skip-db-start", () => {
    assert.deepEqual(parseVerifyArgs(["--part", "fast", "--skip-db-start"]), { mode: "verify", part: "fast", startDb: false });
  });

  it("selects ci-local", () => {
    assert.equal(parseVerifyArgs(["--ci-local"]).mode, "ci-local");
  });

  it("rejects --ci-local with --part", () => {
    assert.throws(() => parseVerifyArgs(["--ci-local", "--part", "fast"]), /--part does not apply to --ci-local: CI always runs the full suite/);
  });

  it("rejects --part without a value or with an unknown value", () => {
    assert.throws(() => parseVerifyArgs(["--part"]), /Unknown verify part ""; use --part full\|fast\|slow/);
    assert.throws(() => parseVerifyArgs(["--part", "bogus"]), /Unknown verify part "bogus"; use --part full\|fast\|slow/);
  });
});
