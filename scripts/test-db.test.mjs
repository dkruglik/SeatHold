import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  adminDatabaseUrl,
  assertLocalOrCiPostgres,
  provisionThrowawayDatabase,
  runInThrowawayDatabase,
  buildPostgresDatabaseUrl,
  createTestDatabaseSql,
  dropTestDatabaseSql,
  terminateTestDatabaseBackendsSql,
  postgresCredentials,
  testDatabaseCommandEnv,
  testDatabaseName,
  testDatabaseUrl,
} from "./test-db-lib.mjs";

describe("postgresCredentials", () => {
  it("reads host and user from DATABASE_URL", () => {
    assert.deepEqual(
      postgresCredentials({ CI: "true", DATABASE_URL: "postgresql://user:pass@postgres:5432/seatholder" }),
      { user: "user", password: "pass", host: "postgres", port: "5432" },
    );
  });

  it("falls back to POSTGRES_* and localhost", () => {
    assert.deepEqual(postgresCredentials({ POSTGRES_PASSWORD: "secret" }), {
      user: "seatholder",
      password: "secret",
      host: "localhost",
      port: "5432",
    });
  });

  it("maps the Compose service hostname postgres to loopback for host-side scripts", () => {
    assert.deepEqual(
      postgresCredentials({ DATABASE_URL: "postgresql://seatholder:seatholder@postgres:5432/seatholder" }),
      { user: "seatholder", password: "seatholder", host: "127.0.0.1", port: "5432" },
    );
  });
});

describe("test database URLs", () => {
  const credentials = { user: "seatholder", password: "p@ss", host: "127.0.0.1", port: "5432" };

  it("targets the postgres maintenance database for admin connections", () => {
    const url = adminDatabaseUrl(credentials);
    const parsed = new URL(url.replace(/^postgresql:/, "http:"));
    assert.equal(parsed.pathname, "/postgres");
    assert.equal(decodeURIComponent(parsed.password), "p@ss");
  });

  it("builds a dedicated TEST_DATABASE_URL for the throwaway database", () => {
    const name = testDatabaseName("a1b2c3");
    const url = testDatabaseUrl(credentials, name);
    assert.match(url, /\/seatholder_test_a1b2c3$/);
  });

  it("sanitizes suffixes and enforces the Postgres identifier length limit", () => {
    assert.equal(testDatabaseName("Ab-C9"), "seatholder_test_ab_c9");
    assert.equal(testDatabaseName("x".repeat(80)).length, 63);
  });
});

describe("SQL helpers", () => {
  it("creates and drops with quoted identifiers and terminates backends separately", () => {
    assert.equal(createTestDatabaseSql("seatholder_test_run"), 'CREATE DATABASE "seatholder_test_run"');
    assert.match(terminateTestDatabaseBackendsSql, /pg_terminate_backend/);
    assert.equal(dropTestDatabaseSql("seatholder_test_run"), 'DROP DATABASE IF EXISTS "seatholder_test_run"');
  });
});

describe("testDatabaseCommandEnv", () => {
  it("sets TEST_DATABASE_URL and DATABASE_URL to the same throwaway database for Prisma", () => {
    const env = testDatabaseCommandEnv({ PATH: "/bin" }, "postgresql://u:p@h:5432/seatholder_test_abc");
    assert.equal(env.TEST_DATABASE_URL, env.DATABASE_URL);
    assert.equal(env.PATH, "/bin");
  });
});

describe("buildPostgresDatabaseUrl", () => {
  it("percent-encodes credentials in the URL", () => {
    const url = buildPostgresDatabaseUrl({
      user: "u",
      password: "p/1",
      host: "h",
      port: "5432",
      database: "d",
    });
    assert.ok(url.includes(encodeURIComponent("p/1")));
  });
});

describe("backend test script", () => {
  // test-db.mjs runs its command from the repository root, so a bare `npm run test:integration` would hit the
  // root wrapper, which provisions a second throwaway database.
  it("runs the integration command in the backend workspace under the throwaway database", () => {
    const scripts = JSON.parse(readFileSync(new URL("../backend/package.json", import.meta.url), "utf8")).scripts;

    assert.match(scripts.test, /test-db\.mjs run -- npm run test:integration -w backend$/);
  });
});

describe("assertLocalOrCiPostgres", () => {
  it("accepts loopback hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
      assert.doesNotThrow(() => assertLocalOrCiPostgres({ host }, {}));
    }
  });

  it("accepts the CI service host", () => {
    assert.doesNotThrow(() => assertLocalOrCiPostgres({ host: "postgres" }, { CI: "true" }));
  });

  it("refuses a remote host outside CI and names the host but never the password", () => {
    assert.throws(
      () => assertLocalOrCiPostgres({ host: "db.internal.example", password: "s3cret" }, {}),
      (error) => /db.internal.example/.test(error.message) && !/s3cret/.test(error.message),
    );
  });
});

describe("provisionThrowawayDatabase", () => {
  it("drops the database and throws when the migration fails", async () => {
    const calls = [];
    await assert.rejects(
      provisionThrowawayDatabase({
        create: async () => calls.push("create"),
        migrate: () => false,
        drop: async () => calls.push("drop"),
      }),
      /migrate deploy failed/,
    );
    assert.deepEqual(calls, ["create", "drop"]);
  });

  it("keeps the database when the migration succeeds", async () => {
    const calls = [];
    await provisionThrowawayDatabase({
      create: async () => calls.push("create"),
      migrate: () => true,
      drop: async () => calls.push("drop"),
    });
    assert.deepEqual(calls, ["create"]);
  });
});

describe("runInThrowawayDatabase", () => {
  function harness({ provision, spawn, drop } = {}) {
    const calls = [];
    const errors = [];
    const deps = {
      provision: provision ?? (async () => ({ databaseName: "seatholder_test_x", env: { A: "1" } })),
      spawn: spawn ?? ((command, env) => (calls.push(["spawn", command, env]), 0)),
      drop: drop ?? (async (provisioned) => calls.push(["drop", provisioned.databaseName])),
      logInfo: () => undefined,
      logError: (message) => errors.push(message),
    };
    return { calls, errors, deps };
  }

  it("runs the command with the throwaway environment, then drops the database", async () => {
    const { calls, deps } = harness();

    assert.equal(await runInThrowawayDatabase(["npm", "test"], deps), 0);
    assert.deepEqual(calls, [["spawn", ["npm", "test"], { A: "1" }], ["drop", "seatholder_test_x"]]);
  });

  it("returns the failing exit code and still drops the database", async () => {
    const { calls, deps } = harness({ spawn: () => 2 });

    assert.equal(await runInThrowawayDatabase(["npm", "test"], deps), 2);
    assert.deepEqual(calls, [["drop", "seatholder_test_x"]]);
  });

  it("drops the database even when starting the command throws", async () => {
    const { calls, deps } = harness({
      spawn: () => {
        throw new Error("boom");
      },
    });

    await assert.rejects(runInThrowawayDatabase(["npm", "test"], deps), /boom/);
    assert.deepEqual(calls, [["drop", "seatholder_test_x"]]);
  });

  it("reports a failed drop and turns a green run into exit code 1", async () => {
    const { errors, deps } = harness({
      drop: async () => {
        throw new Error("drop failed");
      },
    });

    assert.equal(await runInThrowawayDatabase(["npm", "test"], deps), 1);
    assert.deepEqual(errors, ["drop failed"]);
  });

  it("does not run the command or drop anything when provisioning fails", async () => {
    const { calls, errors, deps } = harness({
      provision: async () => {
        throw new Error("no postgres");
      },
    });

    assert.equal(await runInThrowawayDatabase(["npm", "test"], deps), 1);
    assert.deepEqual(calls, []);
    assert.deepEqual(errors, ["no postgres"]);
  });
});
