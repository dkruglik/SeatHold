import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The reason a spawned command never started (missing binary, permissions), or null when it ran. */
export function spawnFailureMessage(command, result) {
  return result.error ? `Could not run ${command}: ${result.error.message}` : null;
}

/**
 * Runs a command with inherited stdio and returns its exit code. A command that never started prints why and
 * returns 1. On Windows npm and npx are .cmd shims, which need a shell, so the line is joined and quoted.
 */
export function spawnCommandLine(command, { cwd, env }) {
  const result =
    process.platform === "win32"
      ? spawnSync(command.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" "), {
          cwd,
          stdio: "inherit",
          env,
          shell: true,
          windowsHide: true,
        })
      : spawnSync(command[0], command.slice(1), { cwd, stdio: "inherit", env });
  const failure = spawnFailureMessage(command[0], result);
  if (failure !== null) console.error(failure);
  return result.status ?? 1;
}

/** Path of npm's or npx's JavaScript CLI, so it runs through `node` without the Windows .cmd shim. */
export function resolveNpmJsCli(bin) {
  const fileName = bin === "npx" ? "npx-cli.js" : "npm-cli.js";
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, "node_modules", "npm", "bin", fileName),
    path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", fileName),
    path.join(rootDir, "node_modules", "npm", "bin", fileName),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Cannot find ${fileName} next to Node at ${nodeDir}`);
  }
  return found;
}
