import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendTimingRecord, currentRunMeta, defaultTimingsFile, median, timingsEnabled } from "./verify-timing.mjs";

// Cold start of the backend app: each sample is a fresh Node process, so "cold" really is the first
// buildApp() and the first app.ready() in that process. "warm" is a second app in the same process.
//   npm run perf:build-app                 five samples, appended to perf/timings.jsonl
//   npm run perf:build-app -- --samples 3
// The app runs with the test config fixture, so no database or .env file is needed; ready() does not connect.
export const RESULT_PREFIX = "BUILD_APP_TIMING ";

const steps = [
  ["import app module", "importMs"],
  ["buildApp() cold", "buildMs"],
  ["app.ready() cold", "readyMs"],
  ["buildApp() warm", "warmBuildMs"],
  ["app.ready() warm", "warmReadyMs"],
];

/** Measures only when timings are on; when off, no child process is started. */
export function measurementPlan({ enabled, samples }) {
  if (!enabled) {
    return { run: false, message: "timings are off (timingsEnabled in scripts/verify-timing.mjs); nothing measured" };
  }
  return { run: true, samples };
}

/** Min, median and max of each measured key over the samples, in milliseconds. */
export function summarizeSamples(samples) {
  if (samples.length === 0) {
    return {};
  }
  const keys = Object.keys(samples[0]);
  return Object.fromEntries(
    keys.map((key) => {
      const values = samples.map((sample) => sample[key]);
      return [key, { min: Math.min(...values), median: median(values), max: Math.max(...values), runs: values.length }];
    }),
  );
}

/** The child prints one line with a prefix; the app's own log lines come before it. */
export function parseChildResult(stdout) {
  const line = stdout
    .split("\n")
    .filter((candidate) => candidate.startsWith(RESULT_PREFIX))
    .at(-1);
  if (line === undefined) {
    throw new Error("build-app child printed no timing line");
  }
  return JSON.parse(line.slice(RESULT_PREFIX.length));
}

/** One record per step of each sample, in seconds, in the same shape as perf/timings.jsonl rows. */
export function sampleRecords(samples, meta) {
  return samples.flatMap((sample) =>
    steps.map(([step, key]) => ({
      ...meta,
      scope: "backend",
      step,
      ok: true,
      seconds: Math.round((sample[key] / 1000) * 1000) / 1000,
    })),
  );
}

function isDirectRun() {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

async function measureInChild() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const importStarted = performance.now();
  const { buildApp } = await import(pathToFileURL(path.join(rootDir, "backend/src/app.ts")).href);
  const importMs = performance.now() - importStarted;
  const { PrismaService } = await import(
    pathToFileURL(path.join(rootDir, "backend/src/infrastructure/persistence/prisma-service.ts")).href
  );
  const { testAppConfig } = await import(
    pathToFileURL(path.join(rootDir, "backend/src/config/tests/app-config-fixture.ts")).href
  );

  const prismaService = new PrismaService(testAppConfig.database.url);
  const timed = async (work) => {
    const started = performance.now();
    const value = await work();
    return [value, performance.now() - started];
  };

  const [first, buildMs] = await timed(() => buildApp({ config: testAppConfig, prismaService }));
  const [, readyMs] = await timed(() => first.ready());
  await first.close();

  const [second, warmBuildMs] = await timed(() => buildApp({ config: testAppConfig, prismaService }));
  const [, warmReadyMs] = await timed(() => second.ready());
  await second.close();
  await prismaService.disconnect();

  const round = (ms) => Math.round(ms * 1000) / 1000;
  process.stdout.write(
    `${RESULT_PREFIX}${JSON.stringify({
      importMs: round(importMs),
      buildMs: round(buildMs),
      readyMs: round(readyMs),
      warmBuildMs: round(warmBuildMs),
      warmReadyMs: round(warmReadyMs),
    })}\n`,
  );
}

function runSample(scriptPath) {
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--child"], {
    cwd: path.dirname(path.dirname(scriptPath)),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`build-app child failed: ${result.error?.message ?? result.stderr}`);
  }
  return parseChildResult(result.stdout);
}

function formatSummary(summary) {
  const lines = steps.map(([step, key]) => {
    const row = summary[key];
    return `  ${step.padEnd(20)} min ${row.min.toFixed(1).padStart(8)} ms   median ${row.median.toFixed(1).padStart(8)} ms   max ${row.max.toFixed(1).padStart(8)} ms   (${row.runs} runs)`;
  });
  return ["buildApp cold start (fresh process per sample)", ...lines].join("\n");
}

function driver() {
  const samplesIndex = process.argv.indexOf("--samples");
  const count = samplesIndex === -1 ? 5 : Number(process.argv[samplesIndex + 1]);
  if (!Number.isInteger(count) || count < 1) {
    console.error("Usage: npm run perf:build-app [-- --samples <positive integer>]");
    process.exitCode = 1;
    return;
  }

  const plan = measurementPlan({ enabled: timingsEnabled, samples: count });
  if (!plan.run) {
    console.log(plan.message);
    return;
  }

  const scriptPath = fileURLToPath(import.meta.url);
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    samples.push(runSample(scriptPath));
    console.log(`sample ${index + 1}/${count} done`);
  }

  const meta = currentRunMeta();
  for (const record of sampleRecords(samples, meta)) {
    appendTimingRecord(defaultTimingsFile, record);
  }
  console.log(formatSummary(summarizeSamples(samples)));
}

if (isDirectRun()) {
  if (process.argv.includes("--child")) {
    await measureInChild();
  } else {
    driver();
  }
}
