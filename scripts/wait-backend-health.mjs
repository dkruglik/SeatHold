import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnvFile } from "./env-file.mjs";

const defaultBackendPort = 3001;
const defaultDeadlineMs = 60_000;
const pollIntervalMs = 500;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function isHealthyBody(text) {
  try {
    return JSON.parse(text)?.status === "ok";
  } catch {
    return false;
  }
}

export function backendHealthUrl(env) {
  const raw = env.BACKEND_PORT;
  if (raw === undefined || raw === "") {
    return `http://127.0.0.1:${defaultBackendPort}/api/health`;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error("Invalid configuration: BACKEND_PORT must be an integer from 1 to 65535");
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new Error("Invalid configuration: BACKEND_PORT must be an integer from 1 to 65535");
  }
  return `http://127.0.0.1:${port}/api/health`;
}

export function readDevEnvFile() {
  const file = path.join(rootDir, ".env");
  if (!existsSync(file)) {
    return {};
  }
  return parseEnvFile(readFileSync(file, "utf8"));
}

export async function waitForBackendHealth(url, deadlineMs = defaultDeadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok && isHealthyBody(await response.text())) {
        return true;
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

async function main() {
  const url = backendHealthUrl({ ...readDevEnvFile(), ...process.env });
  const ready = await waitForBackendHealth(url);
  if (!ready) {
    console.error(`Backend did not answer GET ${url} with {"status":"ok"} within ${defaultDeadlineMs / 1000}s`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
