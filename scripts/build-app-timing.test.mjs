import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESULT_PREFIX, measurementPlan, parseChildResult, sampleRecords, summarizeSamples } from "./build-app-timing.mjs";

const meta = { runId: "r1", ts: "2026-11-10T10:00:00.000Z", commit: "abc", branch: "perf/verify-timing", node: "v24", cpus: 4, memGb: 7 };

describe("summarizeSamples", () => {
  it("gives the min, median and max of the seconds of each step", () => {
    const summary = summarizeSamples([{ cold: 3 }, { cold: 1 }, { cold: 2 }]);
    assert.deepEqual(summary.cold, { min: 1, median: 2, max: 3, runs: 3 });
  });

  it("returns no summary for an empty list", () => {
    assert.deepEqual(summarizeSamples([]), {});
  });
});

describe("parseChildResult", () => {
  it("reads the timing line even when the app logs lines before it", () => {
    const stdout = [
      '{"level":30,"msg":"Server starting"}',
      `${RESULT_PREFIX}{"importMs":120,"buildMs":40,"readyMs":900,"warmBuildMs":5,"warmReadyMs":60}`,
      "",
    ].join("\n");

    assert.deepEqual(parseChildResult(stdout), { importMs: 120, buildMs: 40, readyMs: 900, warmBuildMs: 5, warmReadyMs: 60 });
  });

  it("fails loudly when the child printed no timing line", () => {
    assert.throws(() => parseChildResult('{"level":50,"msg":"boom"}\n'), /no timing line/);
  });
});

describe("sampleRecords", () => {
  it("writes one record per measured step of each child process, in seconds", () => {
    const records = sampleRecords(
      [{ importMs: 120, buildMs: 40, readyMs: 900, warmBuildMs: 5, warmReadyMs: 60 }],
      meta,
    );

    assert.deepEqual(
      records.map((record) => [record.step, record.seconds]),
      [
        ["import app module", 0.12],
        ["buildApp() cold", 0.04],
        ["app.ready() cold", 0.9],
        ["buildApp() warm", 0.005],
        ["app.ready() warm", 0.06],
      ],
    );
    assert.ok(records.every((record) => record.scope === "backend" && record.ok === true && record.runId === "r1"));
  });
});

describe("measurementPlan", () => {
  it("measures nothing and spawns nothing when timings are off", () => {
    const plan = measurementPlan({ enabled: false, samples: 5 });
    assert.equal(plan.run, false);
    assert.match(plan.message, /off/);
  });

  it("measures the requested number of samples when timings are on", () => {
    assert.deepEqual(measurementPlan({ enabled: true, samples: 3 }), { run: true, samples: 3 });
  });
});
