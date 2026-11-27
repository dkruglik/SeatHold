import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backendHealthUrl, readDevEnvFile, waitForBackendHealth } from "./wait-backend-health.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function devSpawnSpecs(repositoryRoot = rootDir) {
  const tsxCli = path.join(repositoryRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const viteCli = path.join(repositoryRoot, "node_modules", "vite", "bin", "vite.js");
  return {
    backend: {
      file: process.execPath,
      args: [tsxCli, "watch", "--env-file-if-exists=../.env", "src/server.ts"],
      cwd: path.join(repositoryRoot, "backend"),
    },
    frontend: {
      file: process.execPath,
      args: [viteCli],
      cwd: path.join(repositoryRoot, "frontend"),
    },
  };
}

function spawnInherit(spec) {
  if (!existsSync(spec.args[0])) {
    throw new Error(`Missing dev tool at ${spec.args[0]}. Run npm ci from the repository root.`);
  }
  return spawn(spec.file, spec.args, {
    cwd: spec.cwd,
    stdio: "inherit",
    env: process.env,
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill();
}

async function main() {
  const specs = devSpawnSpecs();
  const backend = spawnInherit(specs.backend);
  const healthUrl = backendHealthUrl({ ...readDevEnvFile(), ...process.env });

  process.stderr.write(`Waiting for backend at ${healthUrl}…\n`);
  const ready = await waitForBackendHealth(healthUrl);
  if (!ready) {
    process.stderr.write("Backend did not answer within 60s. Fix the backend output above, then retry.\n");
    stopChild(backend);
    process.exit(1);
  }

  const frontend = spawnInherit(specs.frontend);
  let closing = false;

  const closeAll = (exitCode) => {
    if (closing) {
      return;
    }
    closing = true;
    stopChild(backend);
    stopChild(frontend);
    process.exit(exitCode);
  };

  process.on("SIGINT", () => closeAll(130));
  process.on("SIGTERM", () => closeAll(143));

  backend.on("exit", (code, signal) => {
    if (!closing) {
      stopChild(frontend);
      closeAll(signal ? 1 : code ?? 1);
    }
  });

  frontend.on("exit", (code, signal) => {
    if (!closing) {
      stopChild(backend);
      closeAll(signal ? 1 : code ?? 1);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}