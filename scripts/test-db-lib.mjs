import { parsePostgresDatabaseUrl } from "./env-file.mjs";

export function postgresCredentials(env) {
  const parsed = env.DATABASE_URL?.trim() ? parsePostgresDatabaseUrl(env.DATABASE_URL) : null;
  const user = parsed?.user ?? env.POSTGRES_USER ?? "seatholder";
  const password = parsed?.password ?? env.POSTGRES_PASSWORD ?? "seatholder";
  const rawHost = parsed?.host ?? env.POSTGRES_HOST ?? "localhost";
  const port = parsed?.port ?? env.POSTGRES_PORT ?? "5432";
  // .env.docker.local uses the Compose service hostname for containers; host-side scripts reach Postgres on loopback.
  const host =
    env.POSTGRES_HOST ?? (rawHost === "postgres" && env.CI !== "true" ? "127.0.0.1" : rawHost);
  return { user, password, host, port };
}

export function buildPostgresDatabaseUrl({ user, password, host, port, database }) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function adminDatabaseUrl(credentials) {
  return buildPostgresDatabaseUrl({ ...credentials, database: "postgres" });
}

export function testDatabaseUrl(credentials, databaseName) {
  return buildPostgresDatabaseUrl({ ...credentials, database: databaseName });
}

export function testDatabaseName(suffix) {
  const slug = String(suffix).toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return `seatholder_test_${slug}`.slice(0, 63);
}

export function testDatabaseCommandEnv(base, testUrl) {
  return { ...base, TEST_DATABASE_URL: testUrl, DATABASE_URL: testUrl };
}

export const terminateTestDatabaseBackendsSql =
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()";

export const dropTestDatabaseSql = (databaseName) =>
  `DROP DATABASE IF EXISTS ${quoteSqlIdentifier(databaseName)}`;

export const createTestDatabaseSql = (databaseName) =>
  `CREATE DATABASE ${quoteSqlIdentifier(databaseName)}`;

export function quoteSqlIdentifier(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The test scripts create and drop databases with the admin credentials, so they only run against a local
 * Postgres or the CI service. The message names the host and never the password.
 */
export function assertLocalOrCiPostgres({ host }, env) {
  if (loopbackHosts.has(host) || env.CI === "true") return;
  throw new Error(
    `Refusing to create or drop test databases on ${host}: the host is not loopback and CI is not "true". ` +
      "Point POSTGRES_HOST (or DATABASE_URL) at the local Docker Postgres.",
  );
}

/** Creates the database and migrates it; a failed migration drops it again so no seatholder_test_* is left. */
export async function provisionThrowawayDatabase({ create, migrate, drop }) {
  await create();
  if (!migrate()) {
    await drop();
    throw new Error("prisma migrate deploy failed for the throwaway test database.");
  }
}

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Provisions a throwaway database, runs the command against it, and always drops the database afterwards.
 * A failed drop turns the exit code into 1 so a leaked database is never reported as a green run.
 */
export async function runInThrowawayDatabase(command, { provision, spawn, drop, logInfo, logError }) {
  let provisioned;
  try {
    provisioned = await provision();
  } catch (error) {
    logError(messageOf(error));
    return 1;
  }
  let exitCode = 1;
  try {
    exitCode = spawn(command, provisioned.env);
  } finally {
    try {
      await drop(provisioned);
      logInfo(`Test database removed: ${provisioned.databaseName}`);
    } catch (error) {
      logError(messageOf(error));
      exitCode = 1;
    }
  }
  return exitCode;
}
