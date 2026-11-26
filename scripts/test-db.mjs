import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { resolveNpmJsCli, spawnCommandLine, spawnFailureMessage } from "./spawn-command-line.mjs";
import {
  adminDatabaseUrl,
  assertLocalOrCiPostgres,
  provisionThrowawayDatabase,
  runInThrowawayDatabase,
  createTestDatabaseSql,
  dropTestDatabaseSql,
  postgresCredentials,
  terminateTestDatabaseBackendsSql,
  testDatabaseCommandEnv,
  testDatabaseName,
  testDatabaseUrl,
} from "./test-db-lib.mjs";

// Creates a throwaway database on the running Postgres container, runs migrations and tests against
// TEST_DATABASE_URL, then drops the database when the command finishes.
//   node scripts/test-db.mjs up                 create DB, migrate, write .test-db.json (IDE runs)
//   node scripts/test-db.mjs exec -- <command>  run with TEST_DATABASE_URL from .test-db.json
//   node scripts/test-db.mjs run -- <command>   create, migrate, run, drop (CI and npm run test)
//   node scripts/test-db.mjs down               drop DB from .test-db.json
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateFile = path.join(rootDir, ".test-db.json");
const dockerEnvFile = path.join(rootDir, ".env.docker.local");

const require = createRequire(import.meta.url);
const pgPackageRoot = [path.join(rootDir, "node_modules/pg"), path.join(rootDir, "backend/node_modules/pg")].find(
  (candidate) => fs.existsSync(path.join(candidate, "package.json")),
);
if (!pgPackageRoot) {
  throw new Error("Missing pg. Run npm ci from the repo root.");
}
const { Client } = require(pgPackageRoot);

function loadBaseEnv() {
  if (fs.existsSync(dockerEnvFile)) {
    return { ...parseEnv(fs.readFileSync(dockerEnvFile, "utf8")), ...process.env };
  }
  return { ...process.env };
}

function readState() {
  return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null;
}

async function withAdminClient(credentials, run) {
  const client = new Client({ connectionString: adminDatabaseUrl(credentials) });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Resolves to null once Postgres answers, or to the last connection error after all attempts. */
async function waitForPostgres(credentials, attempts = 30) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await withAdminClient(credentials, async (client) => client.query("SELECT 1"));
      return null;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  return lastError;
}

async function createDatabase(credentials, databaseName) {
  await withAdminClient(credentials, async (client) => {
    await client.query(createTestDatabaseSql(databaseName));
  });
}

async function dropDatabase(credentials, databaseName) {
  await withAdminClient(credentials, async (client) => {
    await client.query(terminateTestDatabaseBackendsSql, [databaseName]);
    await client.query(dropTestDatabaseSql(databaseName));
  });
}

function migrateTestDatabase(env) {
  const result = spawnSync(process.execPath, [resolveNpmJsCli("npm"), "run", "db:migrate:deploy", "-w", "backend"], {
    cwd: rootDir,
    stdio: "inherit",
    env,
    windowsHide: true,
  });
  const failure = spawnFailureMessage("npm run db:migrate:deploy", result);
  if (failure !== null) console.error(failure);
  return result.status === 0 && !result.error;
}

async function provisionTestDatabase(baseEnv) {
  const credentials = postgresCredentials(baseEnv);
  assertLocalOrCiPostgres(credentials, baseEnv);
  const unreachable = await waitForPostgres(credentials);
  if (unreachable) {
    const reason = unreachable instanceof Error ? unreachable.message : String(unreachable);
    throw new Error(
      `PostgreSQL is not reachable (${reason}). Run npm run db:start (local) or wait for the CI postgres service.`,
    );
  }
  const databaseName = testDatabaseName(randomBytes(4).toString("hex"));
  const testUrl = testDatabaseUrl(credentials, databaseName);
  const env = testDatabaseCommandEnv(baseEnv, testUrl);
  await provisionThrowawayDatabase({
    create: () => createDatabase(credentials, databaseName),
    migrate: () => migrateTestDatabase(env),
    drop: () => dropDatabase(credentials, databaseName),
  });
  return { credentials, databaseName, testUrl, env };
}

async function up() {
  const existing = readState();
  if (existing) {
    console.log(`Test database already exists: ${existing.databaseName}`);
    console.log(`TEST_DATABASE_URL=${existing.testDatabaseUrl}`);
    return 0;
  }
  try {
    const { databaseName, testUrl } = await provisionTestDatabase(loadBaseEnv());
    fs.writeFileSync(stateFile, JSON.stringify({ databaseName, testDatabaseUrl: testUrl }, null, 2));
    console.log(`Test database ready: ${databaseName}`);
    console.log(`TEST_DATABASE_URL=${testUrl}`);
    console.log("Run integration tests with this URL, then node scripts/test-db.mjs down.");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}

async function down() {
  const state = readState();
  if (!state) {
    console.log("No test database to remove.");
    return 0;
  }
  const baseEnv = loadBaseEnv();
  const credentials = postgresCredentials(baseEnv);
  try {
    assertLocalOrCiPostgres(credentials, baseEnv);
    await dropDatabase(credentials, state.databaseName);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
  fs.rmSync(stateFile);
  console.log(`Test database removed: ${state.databaseName}`);
  return 0;
}

function exec(command) {
  const state = readState();
  if (!state) {
    console.error("No test database. Run `node scripts/test-db.mjs up` first.");
    return 1;
  }
  if (command.length === 0) {
    console.error("Usage: node scripts/test-db.mjs exec -- <command> [args...]");
    return 1;
  }
  const env = testDatabaseCommandEnv(loadBaseEnv(), state.testDatabaseUrl);
  return spawnCommandLine(command, { cwd: rootDir, env });
}

async function run(command) {
  if (command.length === 0) {
    console.error("Usage: node scripts/test-db.mjs run -- <command> [args...]");
    return 1;
  }
  const baseEnv = loadBaseEnv();
  return runInThrowawayDatabase(command, {
    provision: () => provisionTestDatabase(baseEnv),
    spawn: (cmd, env) => spawnCommandLine(cmd, { cwd: rootDir, env }),
    drop: ({ credentials, databaseName }) => dropDatabase(credentials, databaseName),
    logInfo: (message) => console.log(message),
    logError: (message) => console.error(message),
  });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const [action, ...rest] = process.argv.slice(2);
  const commands = {
    up,
    down,
    exec: () => exec(rest[0] === "--" ? rest.slice(1) : rest),
    run: () => run(rest[0] === "--" ? rest.slice(1) : rest),
  };
  if (!commands[action]) {
    console.error("Usage: node scripts/test-db.mjs up | down | exec -- <command> | run -- <command>");
    process.exitCode = 1;
  } else {
    process.exitCode = await commands[action]();
  }
}
