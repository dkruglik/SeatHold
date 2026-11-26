import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkInvalidConfigRun,
  checkShutdownRun,
  dockerRunArgs,
  isHealthyBody,
  smokeSettings,
} from "./image-smoke.mjs";

describe("smokeSettings", () => {
  it("defaults to the host network, the CI image and port 3001", () => {
    const settings = smokeSettings({ IMAGE_SMOKE_DATABASE_URL: "postgresql://u:p@localhost:5432/d" }, []);

    assert.equal(settings.network, "host");
    assert.equal(settings.image, "seatholder-backend:ci");
    assert.equal(settings.port, 3001);
    assert.equal(settings.databaseUrl, "postgresql://u:p@localhost:5432/d");
  });

  it("takes the network from IMAGE_SMOKE_DOCKER_NETWORK and the image from the first argument", () => {
    const settings = smokeSettings(
      { IMAGE_SMOKE_DATABASE_URL: "postgresql://u:p@h/d", IMAGE_SMOKE_DOCKER_NETWORK: "container:abc123" },
      ["seatholder-backend:smoke-check"],
    );

    assert.equal(settings.network, "container:abc123");
    assert.equal(settings.image, "seatholder-backend:smoke-check");
  });

  it("fails without a database URL, naming the variable", () => {
    assert.throws(() => smokeSettings({}, []), /IMAGE_SMOKE_DATABASE_URL/);
  });
});

describe("dockerRunArgs", () => {
  it("runs the image detached under a name on the given network with each variable as -e", () => {
    const args = dockerRunArgs({ image: "img:1", name: "smoke-1", network: "host", env: { APP_ENV: "local", BACKEND_PORT: "3001" } });

    assert.deepEqual(args, ["run", "-d", "--name", "smoke-1", "--network", "host", "-e", "APP_ENV=local", "-e", "BACKEND_PORT=3001", "img:1"]);
  });

  it("never publishes ports or mounts anything", () => {
    const args = dockerRunArgs({ image: "img:1", name: "n", network: "host", env: {} });

    assert.ok(!args.includes("-p") && !args.includes("-v") && !args.includes("--privileged"));
  });
});

describe("isHealthyBody", () => {
  it("accepts exactly status ok", () => {
    assert.equal(isHealthyBody('{"status":"ok"}'), true);
    assert.equal(isHealthyBody('{"status":"down"}'), false);
    assert.equal(isHealthyBody("not json"), false);
  });
});

describe("checkShutdownRun", () => {
  it("passes for a non-root user, exit code 0 and the shutdown complete log line", () => {
    assert.deepEqual(checkShutdownRun({ uid: "1000", exitCode: 0, logs: '{"msg":"shutdown complete"}' }), []);
  });

  it("reports root, a non-zero exit and a missing log line", () => {
    const problems = checkShutdownRun({ uid: "0", exitCode: 137, logs: "" });

    assert.equal(problems.length, 3);
    assert.match(problems.join("\n"), /root/);
    assert.match(problems.join("\n"), /137/);
    assert.match(problems.join("\n"), /shutdown complete/);
  });
});

describe("checkInvalidConfigRun", () => {
  const options = { variable: "BACKEND_PORT", secrets: ["abc", "fake-pw-91"] };

  it("passes for exit code 1 with a log that names the variable and leaks no value", () => {
    assert.deepEqual(checkInvalidConfigRun({ exitCode: 1, logs: "Invalid configuration: BACKEND_PORT must be an integer" }, options), []);
  });

  it("reports a wrong exit code, a missing name and every leaked value", () => {
    const problems = checkInvalidConfigRun({ exitCode: 0, logs: "port abc password fake-pw-91" }, options);

    assert.equal(problems.length, 4);
  });
});
