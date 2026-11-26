import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmJsCli } from "./spawn-command-line.mjs";
import {
  appendTimingRecord,
  currentRunMeta,
  defaultTimingsFile,
  scopeOf,
  slowIntegrationWarning,
  slowTestThresholdSeconds,
  timingRecordsFor,
  timingsEnabled,
} from "./verify-timing.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageScripts = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).scripts;

// Each `&&` segment of these root scripts is one verify step, so backend and frontend are timed apart.
const segmentedScripts = ["lint", "typecheck", "test", "build"];

/** The `&&` segments of a root script, in order. */
export function rootScriptSegments(name, scripts = packageScripts) {
  return scripts[name].split("&&").map((segment) => segment.trim());
}

// The same commands as the GitHub Actions workflow (.github/workflows/ci.yml); verify.test.mjs keeps the two in sync.
// startDb: false is for a database that is already running (scripts/agent-db.mjs).
// part "fast" skips the *.slow.test.ts integration files, part "slow" runs only those (see perf/README.md).
export const verifyParts = ["full", "fast", "slow"];
const integrationCommand = "node scripts/test-db.mjs run -- npm run test:integration -w backend";

export function verifySteps({ startDb = true, timed = timingsEnabled, part = "full" } = {}) {
  if (!verifyParts.includes(part)) {
    throw new Error(`Unknown verify part "${part}"; use one of: ${verifyParts.join(", ")}`);
  }
  const dbSteps = [...(startDb ? [npmStep("db:start")] : []), npmStep("db:generate")];
  if (part === "slow") {
    return [...dbSteps, segmentStep(integrationCommand.replace("test:integration", "test:integration:slow"))];
  }
  return [
    ...dbSteps,
    ...segmentedScripts.flatMap((name) => (timed || (part === "fast" && name === "test") ? rootScriptSegments(name).map((segment) => partSegmentStep(segment, part)) : [npmStep(name)])),
    { label: "node scripts/security-scan.mjs", scope: "root", command: process.execPath, args: ["scripts/security-scan.mjs"] },
  ];
}

function partSegmentStep(segment, part) {
  const swapped = part === "fast" && segment === integrationCommand ? segment.replace("test:integration", "test:integration:fast") : segment;
  return segmentStep(swapped);
}

// A segment is `npm run <script> [args]` or `node <file> [args]`, the same command the root script runs.
function segmentStep(segment) {
  const [program, ...rest] = segment.split(/\s+/);
  if (program === "npm") {
    return { label: segment, scope: scopeOf(segment), command: process.execPath, args: [resolveNpmJsCli("npm"), ...rest] };
  }
  if (program === "node") {
    return { label: segment, scope: scopeOf(segment), command: process.execPath, args: rest };
  }
  throw new Error(`verify cannot run a root script segment that is neither npm nor node: "${segment}"`);
}

// CI runs every job with APP_ENV=production and no .env file. Values already set (or read from
// the env files by the tools) win; these only fill what is missing, with test values.
export function verifyEnv(base = process.env) {
  return {
    ...base,
    APP_ENV: "production",
    DATABASE_URL: base.DATABASE_URL ?? "postgresql://seatholder:seatholder@localhost:5432/seatholder",
    VITE_API_BASE_URL: base.VITE_API_BASE_URL ?? "/api",
    LEGAL_OPERATOR_NAME: base.LEGAL_OPERATOR_NAME ?? "Local Verify Operator",
    LEGAL_OPERATOR_ADDRESS: base.LEGAL_OPERATOR_ADDRESS ?? "ul. Testowa 1, 00-001 Warszawa",
    LEGAL_CONTACT_EMAIL: base.LEGAL_CONTACT_EMAIL ?? "legal@example.com",
  };
}

export function formatVerifySummary(results, part = "full") {
  const lines = results.map(
    (result) => `  ${result.ok ? "PASS" : "FAIL"}  ${result.label.padEnd(44)} ${Math.round(result.seconds)}s`,
  );
  const failed = results.find((result) => !result.ok);
  const name = part === "full" ? "verify" : `verify-${part}-part`;
  const verdict = failed ? `${name} failed at: ${failed.label}` : `${name} passed`;
  return ["", "=== verify summary ===", ...lines, verdict].join("\n");
}

function npmStep(script, ...extra) {
  return {
    label: ["npm run", script, ...extra].join(" "),
    scope: scopeOf(extra.join(" ")),
    command: process.execPath,
    args: [resolveNpmJsCli("npm"), "run", script, ...extra],
  };
}

const integrationFastReport = path.join(rootDir, "perf", "raw", "integration-fast.json");

// After a fast run: integration files over the threshold may belong in the slow part. Never fails verify.
function warnSlowIntegrationFiles(results, file = integrationFastReport) {
  let reportText = null;
  try {
    reportText = fs.readFileSync(file, "utf8");
  } catch {
    // Missing or unreadable: the helper says the check was skipped.
  }
  const integrationRan = results.some((result) => result.label.includes("test:integration:fast"));
  const backendDir = path.join(rootDir, "backend");
  for (const line of slowIntegrationWarning({ integrationRan, reportText, thresholdSeconds: slowTestThresholdSeconds, backendDir })) {
    console.warn(line);
  }
}

function runVerify({ startDb, part }) {
  const env = verifyEnv();
  const results = [];
  if (part === "fast") {
    // A report left by an earlier run must not be read when this run stops before the integration step.
    fs.rmSync(integrationFastReport, { force: true });
  }
  for (const step of verifySteps({ startDb, part })) {
    console.log(`\n=== ${step.label} ===`);
    const started = Date.now();
    const result = spawnSync(step.command, step.args, { cwd: rootDir, stdio: "inherit", env, windowsHide: true });
    const ok = result.status === 0 && !result.error;
    results.push({ label: step.label, scope: step.scope, ok, seconds: (Date.now() - started) / 1000 });
    if (!ok) {
      break;
    }
  }
  console.log(formatVerifySummary(results, part));
  if (part === "fast") {
    warnSlowIntegrationFiles(results);
  }
  if (timingsEnabled) {
    recordTimings(results, part);
  }
  return results.every((result) => result.ok) ? 0 : 1;
}

// Always on: every run appends to perf/timings.jsonl. A failed write must not fail verify.
function recordTimings(results, part) {
  try {
    const meta = { ...currentRunMeta(), part };
    for (const record of timingRecordsFor(results, meta)) {
      appendTimingRecord(defaultTimingsFile, record);
    }
  } catch (error) {
    console.warn(`verify timings were not recorded: ${error.message}`);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** Reads the command line into a part and whether to start the database; throws on a bad argument. */
export function parseVerifyArgs(args) {
  const known = new Set(["--part", "--skip-db-start"]);
  const index = args.indexOf("--part");
  const unknown = args.find((arg, i) => arg.startsWith("--") && !known.has(arg) && (index === -1 || i !== index + 1));
  if (unknown !== undefined) {
    throw new Error(`Unknown argument: ${unknown}`);
  }
  const part = index === -1 ? "full" : (args[index + 1] ?? "");
  if (!verifyParts.includes(part)) {
    throw new Error(`Unknown verify part "${part}"; use --part ${verifyParts.join("|")}`);
  }
  return { part, startDb: !args.includes("--skip-db-start") };
}

if (isDirectRun) {
  try {
    const { part, startDb } = parseVerifyArgs(process.argv.slice(2));
    process.exitCode = runVerify({ startDb, part });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
