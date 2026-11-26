import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { spawnCommandLine, spawnFailureMessage } from "./spawn-command-line.mjs";

// Agent Manager mode: one throwaway PostgreSQL per agent run (docker-compose.agent.yml).
//   node scripts/agent-db.mjs up                 start it, write .agent-db.json
//   node scripts/agent-db.mjs exec -- <command>  run a command with .env.manager and its DATABASE_URL
//   node scripts/agent-db.mjs down               remove containers, network, and volumes; keep the image
//
// Inside a container (Agent Manager), a port published on the Docker host's 127.0.0.1 is not this
// container's loopback. There the database joins this container's network instead
// (docker-compose.agent.shared-network.yml) and listens on its 127.0.0.1. AGENT_DB_NETWORK_CONTAINER
// names the container to join; by default it is this container, found by its hostname.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = "docker-compose.agent.yml";
const sharedNetworkFile = "docker-compose.agent.shared-network.yml";
const managerEnvFile = path.join(rootDir, ".env.manager");
const stateFile = path.join(rootDir, ".agent-db.json");

export function agentDbProjectName(branch, suffix) {
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return `seatholder-agent-${slug}-${suffix}`;
}

export function agentDbCredentials(managerEnv) {
  return {
    user: managerEnv.POSTGRES_USER ?? "seatholder",
    password: managerEnv.POSTGRES_PASSWORD ?? "seatholder",
    database: managerEnv.POSTGRES_DB ?? "seatholder",
  };
}

export function agentDbUrl({ user, password, database }, port) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
}

export function agentDbNetworkContainer({ env, inContainer, hostname }) {
  if (env.AGENT_DB_NETWORK_CONTAINER) return env.AGENT_DB_NETWORK_CONTAINER;
  return inContainer ? hostname : null;
}

function composeArgs(project, networkContainer) {
  const files = networkContainer ? ["-f", composeFile, "-f", sharedNetworkFile] : ["-f", composeFile];
  return ["compose", ...files, "-p", project];
}

export function agentDbUpArgs(project, networkContainer = null) {
  return [...composeArgs(project, networkContainer), "up", "-d", "--wait"];
}

// No --rmi: the pgvector image stays cached on the host for the next run.
export function agentDbDownArgs(project, networkContainer = null) {
  return [...composeArgs(project, networkContainer), "down", "-v", "--remove-orphans"];
}

export function agentDbComposeEnv(base, { user, password, database }, port, networkContainer = null) {
  const env = { ...base, AGENT_DB_PORT: String(port), POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: database };
  if (networkContainer) env.AGENT_DB_NETWORK_CONTAINER = networkContainer;
  return env;
}

// .env.manager stands in for .env, which agents cannot read. Integration tests use TEST_DATABASE_URL.
export function agentDbCommandEnv(base, managerEnv, databaseUrl) {
  return { ...base, ...managerEnv, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl };
}

// "incomplete" means an `up` wrote the state file but compose did not finish: never treat it as running.
export function agentDbStateStatus(state) {
  if (!state) return "none";
  return state.ready === false ? "incomplete" : "ready";
}

const incompleteMessage = "The last `up` did not finish. Run `node scripts/agent-db.mjs down` first.";

function readManagerEnv() {
  if (!fs.existsSync(managerEnvFile)) {
    throw new Error(`Missing ${managerEnvFile}. Agent Manager runs use it in place of .env.`);
  }
  return parseEnv(fs.readFileSync(managerEnvFile, "utf8"));
}

function readState() {
  return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export { spawnFailureMessage };

function reportSpawnFailure(command, result) {
  const message = spawnFailureMessage(command, result);
  if (message !== null) console.error(message);
}

function currentBranch() {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: rootDir, encoding: "utf8" });
  if (result.status === 0) return result.stdout.trim();
  reportSpawnFailure("git", result);
  console.error("Could not read the git branch; using the project name suffix \"run\".");
  return "run";
}

function docker(args, env = process.env) {
  const result = spawnSync("docker", args, { cwd: rootDir, stdio: "inherit", env, windowsHide: true });
  reportSpawnFailure("docker", result);
  return result.status === 0 && !result.error;
}

async function up() {
  const existing = readState();
  const status = agentDbStateStatus(existing);
  if (status === "incomplete") {
    console.error(incompleteMessage);
    return 1;
  }
  if (status === "ready") {
    console.log(`Agent database already running: ${existing.project} on port ${existing.port}`);
    return 0;
  }
  const credentials = agentDbCredentials(readManagerEnv());
  const port = await freePort();
  const project = agentDbProjectName(currentBranch(), randomBytes(3).toString("hex"));
  const networkContainer = agentDbNetworkContainer({
    env: process.env,
    inContainer: fs.existsSync("/.dockerenv"),
    hostname: os.hostname(),
  });
  const state = { project, port, networkContainer, databaseUrl: agentDbUrl(credentials, port) };
  // Written first, so `down` can clean up even when `up` fails halfway; ready only after compose succeeds.
  fs.writeFileSync(stateFile, JSON.stringify({ ...state, ready: false }, null, 2));
  const composeEnv = agentDbComposeEnv(process.env, credentials, port, networkContainer);
  if (!docker(agentDbUpArgs(project, networkContainer), composeEnv)) {
    console.error("Agent database did not start. Run `node scripts/agent-db.mjs down` to clean up.");
    return 1;
  }
  fs.writeFileSync(stateFile, JSON.stringify({ ...state, ready: true }, null, 2));
  console.log(`Agent database ready: ${project} on 127.0.0.1:${port}`);
  return 0;
}

function exec(command) {
  const state = readState();
  if (!state) {
    console.error("No agent database. Run `node scripts/agent-db.mjs up` first.");
    return 1;
  }
  if (agentDbStateStatus(state) === "incomplete") {
    console.error(incompleteMessage);
    return 1;
  }
  if (command.length === 0) {
    console.error("Usage: node scripts/agent-db.mjs exec -- <command> [args...]");
    return 1;
  }
  const env = agentDbCommandEnv(process.env, readManagerEnv(), state.databaseUrl);
  return spawnCommandLine(command, { cwd: rootDir, env });
}

function down() {
  const state = readState();
  if (!state) {
    console.log("No agent database to remove.");
    return 0;
  }
  const credentials = agentDbCredentials(readManagerEnv());
  // State files from before the shared-network mode have no networkContainer: they used the published port.
  const networkContainer = state.networkContainer ?? null;
  const composeEnv = agentDbComposeEnv(process.env, credentials, state.port, networkContainer);
  if (!docker(agentDbDownArgs(state.project, networkContainer), composeEnv)) {
    return 1;
  }
  fs.rmSync(stateFile);
  console.log(`Agent database removed: ${state.project}`);
  return 0;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const [action, ...rest] = process.argv.slice(2);
  const commands = { up, down, exec: () => exec(rest[0] === "--" ? rest.slice(1) : rest) };
  if (!commands[action]) {
    console.error("Usage: node scripts/agent-db.mjs up | exec -- <command> | down");
    process.exitCode = 1;
  } else {
    process.exitCode = await commands[action]();
  }
}
