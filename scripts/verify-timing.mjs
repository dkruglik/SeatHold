import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Every `npm run verify` appends one JSON line per step to perf/timings.jsonl (see perf/README.md).
//   node scripts/verify-timing.mjs --summary   median seconds per scope and step over all recorded runs
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultTimingsFile = path.join(rootDir, "perf", "timings.jsonl");

// Feature flag for all timing: verify steps are split per workspace and recorded, and perf:build-app measures.
// false restores the plain verify commands and writes nothing, so nothing is measured or recorded.
export const timingsEnabled = true;

/** The workspace a command runs in (`-w backend`), or "root" for commands that run at the repo root. */
export function scopeOf(command) {
  const match = /-w (\S+)/.exec(command);
  return match ? match[1] : "root";
}

function roundSeconds(seconds) {
  return Math.round(seconds * 1000) / 1000;
}

/**
 * One record per step result. A `total` row is added only when every step passed: a failed run
 * stops early, so its sum would not be comparable with full runs. `meta` is shared by one run's rows.
 */
export function timingRecordsFor(results, meta) {
  const steps = results.map((result) => ({
    ...meta,
    scope: result.scope,
    step: result.label,
    ok: result.ok,
    seconds: roundSeconds(result.seconds),
  }));
  if (!results.every((result) => result.ok)) {
    return steps;
  }
  const total = results.reduce((sum, result) => sum + result.seconds, 0);
  return [...steps, { ...meta, scope: "root", step: "total", ok: true, seconds: roundSeconds(total) }];
}

export function appendTimingRecord(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

export function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Median seconds per scope and step, slowest first. */
export function summarize(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.scope}\u0000${record.step}`;
    const group = groups.get(key) ?? { scope: record.scope, step: record.step, seconds: [] };
    group.seconds.push(record.seconds);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      scope: group.scope,
      step: group.step,
      runs: group.seconds.length,
      medianSeconds: median(group.seconds),
    }))
    .sort((a, b) => b.medianSeconds - a.medianSeconds);
}

export const slowTestThresholdSeconds = 3;

/** Files of a parsed Vitest JSON report that ran longer than the threshold, slowest first. */
export function slowTestFiles(report, thresholdSeconds) {
  return (report?.testResults ?? [])
    .map((result) => ({ file: result.name, seconds: roundSeconds((result.endTime - result.startTime) / 1000) }))
    .filter((entry) => entry.seconds > thresholdSeconds)
    .sort((a, b) => b.seconds - a.seconds);
}

/**
 * The lines to print after a fast run. Empty when the integration step did not run or no file is slow;
 * one line when the per-file report is missing or unreadable, so a skipped check is visible.
 */
export function slowIntegrationWarning({ integrationRan, reportText, thresholdSeconds, backendDir }) {
  if (!integrationRan) {
    return [];
  }
  let report = null;
  try {
    report = reportText === null ? null : JSON.parse(reportText);
  } catch {
    report = null;
  }
  if (report === null || typeof report !== "object") {
    return ["\nThe per-file report perf/raw/integration-fast.json was missing or unreadable, so the slow-file check was skipped."];
  }
  const slow = slowTestFiles(report, thresholdSeconds);
  if (slow.length === 0) {
    return [];
  }
  return [
    `\nIntegration files slower than ${thresholdSeconds}s may belong in the slow part (name them *.slow.test.ts):`,
    ...slow.map((entry) => `  ${path.relative(backendDir, entry.file).split(path.sep).join("/")}  ${entry.seconds.toFixed(1)}s`),
  ];
}

function git(args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

/** Metadata shared by every row of one verify run. */
export function currentRunMeta(now = new Date()) {
  return {
    runId: `${now.getTime().toString(36)}-${randomBytes(3).toString("hex")}`,
    ts: now.toISOString(),
    commit: git(["rev-parse", "--short=12", "HEAD"]),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    node: process.version,
    cpus: os.cpus().length,
    memGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
  };
}

function readRecords(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function formatSummary(rows) {
  const lines = rows.map(
    (row) => `  ${row.medianSeconds.toFixed(3).padStart(9)}s  ${String(row.runs).padStart(4)} runs  ${row.scope.padEnd(10)} ${row.step}`,
  );
  return ["median   runs  scope      step", ...lines].join("\n");
}

function isDirectRun() {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  if (process.argv.includes("--summary")) {
    const records = readRecords(defaultTimingsFile).filter((record) => record.step !== "total");
    console.log(records.length === 0 ? "No timing records yet. Run npm run verify first." : formatSummary(summarize(records)));
  } else {
    console.error("Usage: node scripts/verify-timing.mjs --summary");
    process.exitCode = 1;
  }
}
