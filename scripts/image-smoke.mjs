import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// CI-only smoke test of the built backend image (the `image-smoke` job; scripts/verify.mjs does not run it).
//   node scripts/image-smoke.mjs [image]
// Environment: IMAGE_SMOKE_DATABASE_URL (required), IMAGE_SMOKE_DOCKER_NETWORK (default `host`, which works on
// GitHub's Linux runners; inside a container use `container:<id>` so the database on its loopback is reachable).
// Case 1: the image starts, answers /api/health, runs as non-root, and stops cleanly on SIGTERM (exit 0).
// Case 2: an invalid BACKEND_PORT makes it exit 1, naming the variable and printing neither value nor password.

const port = 3001;
const fakePassword = "smoke-fake-pw-7f3a91";
const healthDeadlineMs = 60_000;

export function smokeSettings(env, argv) {
  const databaseUrl = env.IMAGE_SMOKE_DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") {
    throw new Error("IMAGE_SMOKE_DATABASE_URL is required");
  }
  return {
    network: env.IMAGE_SMOKE_DOCKER_NETWORK || "host",
    image: argv[0] || "seatholder-backend:ci",
    port,
    databaseUrl,
  };
}

// A throwaway pepper for the smoke containers (the backend requires one in every environment). Not a secret.
const smokePepper = "image-smoke-pepper-not-a-secret-0123456789";

const smokeCsrfSecret = "image-smoke-csrf-secret-not-a-secret-0123456789";

export function smokeEnv(databaseUrl, extra) {
  return { APP_ENV: "local", DATABASE_URL: databaseUrl, AUTH_CODE_PEPPER: smokePepper, CSRF_SECRET: smokeCsrfSecret, ...extra };
}

export function dockerRunArgs({ image, name, network, env }) {
  const envArgs = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  return ["run", "-d", "--name", name, "--network", network, ...envArgs, image];
}

export function isHealthyBody(text) {
  try {
    return JSON.parse(text)?.status === "ok";
  } catch {
    return false;
  }
}

export function checkShutdownRun({ uid, exitCode, logs }) {
  const problems = [];
  if (uid === "0") problems.push("the container runs as root (uid 0)");
  if (exitCode !== 0) problems.push(`expected exit code 0 after SIGTERM, got ${exitCode}`);
  if (!logs.includes("shutdown complete")) problems.push('the log has no "shutdown complete" line');
  return problems;
}

export function checkInvalidConfigRun({ exitCode, logs }, { variable, secrets }) {
  const problems = [];
  if (exitCode !== 1) problems.push(`expected exit code 1, got ${exitCode}`);
  if (!logs.includes(variable)) problems.push(`the output does not name ${variable}`);
  for (const secret of secrets) {
    if (logs.includes(secret)) problems.push(`the output contains the value "${secret}"`);
  }
  return problems;
}

function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error) throw new Error(`Could not run docker: ${result.error.message}`);
  return { status: result.status, out: result.stdout ?? "", err: result.stderr ?? "" };
}

async function waitForHealth(url, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok && isHealthyBody(await response.text())) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function logsOf(name) {
  const { out, err } = docker(["logs", name]);
  return out + err;
}

async function healthyShutdownCase(settings, name) {
  const env = smokeEnv(settings.databaseUrl, { BACKEND_PORT: String(settings.port) });
  const started = docker(dockerRunArgs({ image: settings.image, name, network: settings.network, env }));
  if (started.status !== 0) return [`docker run failed: ${started.err.trim()}`];
  if (!(await waitForHealth(`http://127.0.0.1:${settings.port}/api/health`, healthDeadlineMs))) {
    return [`/api/health did not answer {"status":"ok"} within ${healthDeadlineMs / 1000}s`, logsOf(name)];
  }
  const uid = docker(["exec", name, "id", "-u"]).out.trim();
  docker(["stop", "--time", "30", name]);
  const exitCode = Number(docker(["inspect", "-f", "{{.State.ExitCode}}", name]).out.trim());
  return checkShutdownRun({ uid, exitCode, logs: logsOf(name) });
}

function invalidConfigCase(settings, name) {
  const databaseUrl = `postgresql://seatholder:${fakePassword}@127.0.0.1:5432/seatholder`;
  const env = smokeEnv(databaseUrl, { BACKEND_PORT: "abc" });
  const started = docker(dockerRunArgs({ image: settings.image, name, network: settings.network, env }));
  if (started.status !== 0) return [`docker run failed: ${started.err.trim()}`];
  const exitCode = Number(docker(["wait", name]).out.trim());
  return checkInvalidConfigRun({ exitCode, logs: logsOf(name) }, { variable: "BACKEND_PORT", secrets: ["abc", fakePassword] });
}

async function main() {
  const settings = smokeSettings(process.env, process.argv.slice(2));
  const suffix = randomBytes(4).toString("hex");
  const cases = [
    ["healthy start, non-root, clean shutdown", `seatholder-smoke-ok-${suffix}`, (name) => healthyShutdownCase(settings, name)],
    ["invalid BACKEND_PORT fails fast without leaking values", `seatholder-smoke-bad-${suffix}`, (name) => invalidConfigCase(settings, name)],
  ];
  let failed = false;
  for (const [title, name, run] of cases) {
    let problems;
    try {
      problems = await run(name);
    } catch (error) {
      problems = [error instanceof Error ? error.message : "unexpected error"];
    } finally {
      docker(["rm", "-f", name]);
    }
    console.log(`${problems.length === 0 ? "PASS" : "FAIL"}  ${title}`);
    for (const problem of problems) console.log(`      ${problem}`);
    failed ||= problems.length > 0;
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
