import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  agentDbCommandEnv,
  agentDbComposeEnv,
  agentDbCredentials,
  agentDbDownArgs,
  agentDbNetworkContainer,
  agentDbProjectName,
  agentDbStateStatus,
  agentDbUpArgs,
  agentDbUrl,
  spawnFailureMessage,
} from "./agent-db.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

function postgresImage(composeFile) {
  return read(composeFile).match(/^\s+postgres:\s*\n\s+image:\s*(\S+)/m)?.[1];
}

describe("agentDbProjectName", () => {
  it("gives every run its own compose project, named after the branch", () => {
    assert.equal(agentDbProjectName("feature/Billing_Plans", "a1b2c3"), "seatholder-agent-feature-billing-plans-a1b2c3");
    assert.match(agentDbProjectName("x".repeat(80), "a1b2c3"), /^seatholder-agent-x{30}-a1b2c3$/);
  });
});

describe("agentDbCredentials", () => {
  it("reads POSTGRES_* from .env.manager and falls back to the test defaults", () => {
    assert.deepEqual(agentDbCredentials({ POSTGRES_PASSWORD: "p@ss" }), {
      user: "seatholder",
      password: "p@ss",
      database: "seatholder",
    });
  });

  it("builds a DATABASE_URL on the run's own port with the password encoded", () => {
    const password = "p@ss/1";
    const url = agentDbUrl({ user: "seatholder", password, database: "seatholder" }, 54012);
    const parsed = new URL(url);
    assert.equal(parsed.protocol, "postgresql:");
    assert.equal(parsed.username, "seatholder");
    assert.equal(decodeURIComponent(parsed.password), password);
    assert.ok(url.includes(encodeURIComponent(password)));
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.port, "54012");
    assert.equal(parsed.pathname, "/seatholder");
  });
});

describe("compose commands", () => {
  it("uses only the agent compose file and the run's project", () => {
    const args = agentDbUpArgs("seatholder-agent-x-1");
    assert.deepEqual(args.slice(0, 5), ["compose", "-f", "docker-compose.agent.yml", "-p", "seatholder-agent-x-1"]);
    assert.ok(args.includes("--wait"));
  });

  it("removes containers, network, and volumes but keeps the cached image", () => {
    const args = agentDbDownArgs("seatholder-agent-x-1");
    assert.ok(args.includes("down") && args.includes("-v") && args.includes("--remove-orphans"));
    assert.ok(!args.includes("--rmi"));
  });

  it("passes the port and credentials to compose", () => {
    const env = agentDbComposeEnv({ PATH: "/bin" }, { user: "u", password: "p", database: "d" }, 54012);
    assert.equal(env.AGENT_DB_PORT, "54012");
    assert.equal(env.POSTGRES_USER, "u");
    assert.equal(env.PATH, "/bin");
  });
});

describe("agentDbNetworkContainer", () => {
  it("joins the container the script runs in, so a host-published port is not needed", () => {
    assert.equal(agentDbNetworkContainer({ env: {}, inContainer: true, hostname: "d5a99b38122c" }), "d5a99b38122c");
  });

  it("uses AGENT_DB_NETWORK_CONTAINER when set, inside a container or not", () => {
    const env = { AGENT_DB_NETWORK_CONTAINER: "agent-manager" };
    assert.equal(agentDbNetworkContainer({ env, inContainer: true, hostname: "d5a99b38122c" }), "agent-manager");
    assert.equal(agentDbNetworkContainer({ env, inContainer: false, hostname: "laptop" }), "agent-manager");
  });

  it("keeps the published localhost port on a plain host", () => {
    assert.equal(agentDbNetworkContainer({ env: {}, inContainer: false, hostname: "laptop" }), null);
  });
});

describe("shared-network compose commands", () => {
  const sharedFile = "docker-compose.agent.shared-network.yml";

  it("adds the shared-network override to up and down only inside a container", () => {
    for (const args of [agentDbUpArgs("p", "agent-manager"), agentDbDownArgs("p", "agent-manager")]) {
      assert.deepEqual(args.slice(0, 7), ["compose", "-f", "docker-compose.agent.yml", "-f", sharedFile, "-p", "p"]);
    }
    assert.ok(!agentDbUpArgs("p", null).includes(sharedFile));
    assert.ok(!agentDbDownArgs("p", null).includes(sharedFile));
  });

  it("passes the container to join to compose", () => {
    const creds = { user: "u", password: "p", database: "d" };
    assert.equal(agentDbComposeEnv({}, creds, 54012, "agent-manager").AGENT_DB_NETWORK_CONTAINER, "agent-manager");
    assert.equal(agentDbComposeEnv({}, creds, 54012, null).AGENT_DB_NETWORK_CONTAINER, undefined);
  });

  it("runs postgres in that container's network on the run's port, on localhost only, with no published port", () => {
    const compose = read(sharedFile);
    assert.match(compose, /network_mode:\s*"container:\$\{AGENT_DB_NETWORK_CONTAINER:\?[^}]*\}"/);
    assert.match(compose, /ports:\s*!reset\s*\[\]/);
    assert.match(compose, /port=\$\{AGENT_DB_PORT:\?[^}]*\}/);
    assert.match(compose, /listen_addresses=127\.0\.0\.1/);
    assert.match(compose, /pg_isready[^\n]*-h 127\.0\.0\.1[^\n]*-p \$\{AGENT_DB_PORT\}/);
  });
});

describe("agentDbStateStatus", () => {
  it("reports a state file from an unfinished or failed up as incomplete, not running", () => {
    assert.equal(agentDbStateStatus(null), "none");
    assert.equal(agentDbStateStatus({ project: "p", port: 1, databaseUrl: "u", ready: false }), "incomplete");
    assert.equal(agentDbStateStatus({ project: "p", port: 1, databaseUrl: "u", ready: true }), "ready");
  });
});

describe("spawnFailureMessage", () => {
  it("names a command that could not start, and stays quiet for one that ran", () => {
    const missing = Object.assign(new Error("spawnSync docker ENOENT"), { code: "ENOENT" });
    assert.equal(spawnFailureMessage("docker", { status: null, error: missing }), "Could not run docker: spawnSync docker ENOENT");
    assert.equal(spawnFailureMessage("docker", { status: 1, error: undefined }), null);
    assert.equal(spawnFailureMessage("docker", { status: 0, error: undefined }), null);
  });
});

describe("agentDbCommandEnv", () => {
  it("loads .env.manager over the shell and points DATABASE_URL and TEST_DATABASE_URL at the run's database", () => {
    const env = agentDbCommandEnv(
      { PATH: "/bin", DATABASE_URL: "postgresql://shell" },
      { CSRF_SECRET: "test", DATABASE_URL: "postgresql://manager" },
      "postgresql://agent",
    );
    assert.equal(env.PATH, "/bin");
    assert.equal(env.CSRF_SECRET, "test");
    assert.equal(env.DATABASE_URL, "postgresql://agent");
    assert.equal(env.TEST_DATABASE_URL, "postgresql://agent");
  });
});

describe("docker-compose.agent.yml", () => {
  it("reuses the local postgres image, so the host keeps one cached copy", () => {
    assert.ok(postgresImage("docker-compose.yml"));
    assert.equal(postgresImage("docker-compose.agent.yml"), postgresImage("docker-compose.yml"));
  });

  it("binds a per-run port on localhost and keeps data in memory, not on disk", () => {
    const compose = read("docker-compose.agent.yml");
    assert.match(compose, /"127\.0\.0\.1:\$\{AGENT_DB_PORT:\?[^}]*\}:5432"/);
    assert.match(compose, /tmpfs:\s*\n\s+- \/var\/lib\/postgresql\/data/);
    assert.doesNotMatch(compose, /^volumes:/m);
    assert.doesNotMatch(compose, /env_file/);
  });
});
