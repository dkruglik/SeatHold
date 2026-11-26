import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  appendTimingRecord,
  median,
  scopeOf,
  slowIntegrationWarning,
  slowTestFiles,
  slowTestThresholdSeconds,
  summarize,
  timingRecordsFor,
} from "./verify-timing.mjs";

const meta = { runId: "run-1", ts: "2026-11-10T10:00:00.000Z", commit: "abc123", branch: "perf/verify-timing", node: "v24.0.0", cpus: 4, memGb: 7 };

describe("scopeOf", () => {
  it("names the workspace a command runs in, and root for commands that run at the repo root", () => {
    assert.equal(scopeOf("npm run lint -w backend"), "backend");
    assert.equal(scopeOf("npm run build -w frontend"), "frontend");
    assert.equal(scopeOf("node --test scripts/verify.test.mjs"), "root");
    assert.equal(scopeOf("node scripts/sync-ai-rules.mjs --check"), "root");
  });
});

describe("timingRecordsFor", () => {
  it("turns each step result into one record with the run metadata, and adds a total row", () => {
    const records = timingRecordsFor(
      [
        { label: "npm run lint -w backend", scope: "backend", ok: true, seconds: 12.34567 },
        { label: "npm run test -w frontend", scope: "frontend", ok: false, seconds: 3 },
      ],
      meta,
    );

    assert.deepEqual(records[0], { ...meta, scope: "backend", step: "npm run lint -w backend", ok: true, seconds: 12.346 });
    assert.deepEqual(records[1], { ...meta, scope: "frontend", step: "npm run test -w frontend", ok: false, seconds: 3 });
    assert.equal(records.length, 2, "a failed run has no total row");
  });

  it("adds a total row only when every step passed, summing the steps", () => {
    const records = timingRecordsFor(
      [
        { label: "npm run lint -w backend", scope: "backend", ok: true, seconds: 1.5 },
        { label: "npm run build -w frontend", scope: "frontend", ok: true, seconds: 2.25 },
      ],
      meta,
    );

    assert.deepEqual(records[2], { ...meta, scope: "root", step: "total", ok: true, seconds: 3.75 });
  });
});

describe("appendTimingRecord", () => {
  it("creates the folder and file, then adds one JSON line per record without rewriting earlier lines", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-timing-"));
    const file = path.join(dir, "perf", "timings.jsonl");

    appendTimingRecord(file, { step: "a", seconds: 1 });
    appendTimingRecord(file, { step: "b", seconds: 2 });

    const lines = fs.readFileSync(file, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(lines, [
      { step: "a", seconds: 1 },
      { step: "b", seconds: 2 },
    ]);
  });
});

describe("median", () => {
  it("returns the middle value, or the mean of the two middle values", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), null);
  });
});

describe("summarize", () => {
  it("gives the median time and run count for each scope and step, slowest first", () => {
    const rows = summarize([
      { scope: "backend", step: "test", seconds: 10, ok: true },
      { scope: "backend", step: "test", seconds: 30, ok: true },
      { scope: "backend", step: "test", seconds: 20, ok: true },
      { scope: "frontend", step: "test", seconds: 5, ok: true },
    ]);

    assert.deepEqual(rows, [
      { scope: "backend", step: "test", runs: 3, medianSeconds: 20 },
      { scope: "frontend", step: "test", runs: 1, medianSeconds: 5 },
    ]);
  });
});

describe("timingRecordsFor part", () => {
  it("keeps the part from the run metadata on every row", () => {
    const records = timingRecordsFor([{ label: "npm run lint", scope: "root", ok: true, seconds: 1 }], { ...meta, part: "fast" });

    assert.ok(records.every((record) => record.part === "fast"));
  });
});

describe("slowTestFiles", () => {
  const file = (name, startTime, endTime) => ({ name, startTime, endTime });

  it("returns only files over the threshold, slowest first, with paths as given", () => {
    const report = {
      testResults: [
        file("/a/fast.test.ts", 0, 1000),
        file("/a/slow.test.ts", 0, 4000),
        file("/a/slowest.test.ts", 100, 9100),
        file("/a/exact.test.ts", 0, 3000),
      ],
    };

    assert.equal(slowTestThresholdSeconds, 3);
    assert.deepEqual(slowTestFiles(report, 3), [
      { file: "/a/slowest.test.ts", seconds: 9 },
      { file: "/a/slow.test.ts", seconds: 4 },
    ]);
  });

  it("returns an empty list when testResults is empty or missing", () => {
    assert.deepEqual(slowTestFiles({ testResults: [] }, 3), []);
    assert.deepEqual(slowTestFiles({}, 3), []);
  });
});

describe("slowIntegrationWarning", () => {
  const backendDir = path.join(path.sep, "repo", "backend");
  const report = (entries) =>
    JSON.stringify({ testResults: entries.map(([name, seconds]) => ({ name: path.join(backendDir, name), startTime: 0, endTime: seconds * 1000 })) });
  const run = (options) => slowIntegrationWarning({ integrationRan: true, thresholdSeconds: 3, backendDir, reportText: report([]), ...options });

  it("says nothing when the integration step did not run", () => {
    assert.deepEqual(run({ integrationRan: false, reportText: null }), []);
  });

  it("says the check was skipped when the report is missing", () => {
    const lines = run({ reportText: null });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /perf\/raw\/integration-fast\.json/);
    assert.match(lines[0], /skipped/);
  });

  it("says the check was skipped when the report is not valid JSON", () => {
    const lines = run({ reportText: "{nope" });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /unreadable|skipped/);
  });

  it("says nothing when no file is over the threshold", () => {
    assert.deepEqual(run({ reportText: report([["src/a.test.ts", 1], ["src/b.test.ts", 3]]) }), []);
  });

  it("lists files over the threshold, slowest first, relative to backend with forward slashes", () => {
    const lines = run({ reportText: report([["src/a.test.ts", 4], ["src/x/b.test.ts", 9.5], ["src/c.test.ts", 1]]) });
    assert.equal(lines.length, 3);
    assert.match(lines[0], /slower than 3s/);
    assert.match(lines[1], /^ {2}src\/x\/b\.test\.ts {2}9\.5s$/);
    assert.match(lines[2], /^ {2}src\/a\.test\.ts {2}4\.0s$/);
  });
});
