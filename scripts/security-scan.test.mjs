import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditExceptions,
  evaluateAudit,
  parseSecurityArgs,
  semgrepConfigs,
  semgrepExcludes,
  semgrepImage,
  semgrepRunPlan,
  semgrepScanArgs,
  toDockerVolumePath,
} from "./security-scan.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("security scan", () => {
  it("pins the Semgrep image and the rulesets for this stack", () => {
    assert.equal(semgrepImage, "semgrep/semgrep:1.185.0");
    assert.deepEqual(semgrepConfigs, [
      "p/javascript",
      "p/typescript",
      "p/nodejs",
      "p/react",
      "p/owasp-top-ten",
      "p/docker",
      "p/secrets",
    ]);
    assert.ok(semgrepExcludes.includes("node_modules"));
    assert.ok(semgrepExcludes.includes("backend/src/generated"));
  });

  it("fails the scan on findings and does not send metrics", () => {
    const args = semgrepScanArgs();
    assert.equal(args[0], "scan");
    assert.ok(args.includes("--error"));
    assert.ok(args.includes("--metrics=off"));
    for (const config of semgrepConfigs) {
      const index = args.indexOf(config);
      assert.equal(args[index - 1], "--config");
    }
  });

  it("maps a Windows path to a Docker volume path", () => {
    assert.equal(
      toDockerVolumePath("C:\\Users\\dkrug\\Projects\\SeatHolder", "win32"),
      "/c/Users/dkrug/Projects/SeatHolder",
    );
    assert.equal(toDockerVolumePath("/work/SeatHolder", "linux"), "/work/SeatHolder");
  });

  it("runs both checks by default, with Docker Semgrep", () => {
    const options = parseSecurityArgs([]);
    assert.deepEqual(options.checks, ["semgrep", "audit"]);
    assert.equal(options.native, false);
  });

  it("runs only the selected check", () => {
    assert.deepEqual(parseSecurityArgs(["--check", "audit"]).checks, ["audit"]);
    assert.deepEqual(parseSecurityArgs(["--check", "semgrep"]).checks, ["semgrep"]);
  });

  it("rejects unknown checks and arguments", () => {
    assert.throws(() => parseSecurityArgs(["--check", "nope"]), /Unknown check: nope/);
    assert.throws(() => parseSecurityArgs(["--chek", "audit"]), /Unknown argument: --chek/);
    assert.throws(() => parseSecurityArgs(["--check"]), /Unknown check: undefined/);
  });

  it("runs the semgrep binary directly with the same scan args when native", () => {
    assert.equal(parseSecurityArgs(["--check", "semgrep", "--native"]).native, true);
    const plan = semgrepRunPlan({ native: true, volume: "/c/unused" });
    assert.equal(plan.command, "semgrep");
    assert.deepEqual(plan.args, semgrepScanArgs());
  });

  it("runs Semgrep in the pinned Docker image by default", () => {
    const plan = semgrepRunPlan({ native: false, volume: "/c/Users/dkrug/Projects/SeatHolder" });
    assert.equal(plan.command, "docker");
    assert.deepEqual(plan.args, [
      "run",
      "--rm",
      "-v",
      "/c/Users/dkrug/Projects/SeatHolder:/src",
      "-w",
      "/src",
      semgrepImage,
      "semgrep",
      ...semgrepScanArgs(),
    ]);
  });

  it("keeps the GitLab semgrep job on the same scan args", () => {
    const expected = `- semgrep ${semgrepScanArgs().join(" ")}`;
    const ci = readFileSync(path.join(repoRoot, ".gitlab-ci.yml"), "utf8");
    assert.ok(
      ci.split("\n").some((line) => line.trim() === expected),
      `.gitlab-ci.yml must contain the line: ${expected}`,
    );
  });
});

const picomatchAdvisory = {
  source: 1247710,
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high",
  range: "<=4.0.7",
};

function report(vulnerabilities) {
  return { vulnerabilities };
}

const picomatchOnly = report({
  picomatch: { name: "picomatch", severity: "high", via: [picomatchAdvisory] },
  vite: { name: "vite", severity: "high", via: ["picomatch"] },
});

const exception = { id: "GHSA-fc5q-39xc-vjpf", package: "picomatch", expires: "2026-12-03", reason: "test" };

describe("npm audit exceptions", () => {
  it("keeps one dated exception for the dev-only picomatch advisory", () => {
    assert.deepEqual(
      auditExceptions.map(({ id, package: name, expires }) => ({ id, name, expires })),
      [{ id: "GHSA-fc5q-39xc-vjpf", name: "picomatch", expires: "2026-12-03" }],
    );
    assert.ok(auditExceptions.every((entry) => entry.reason.length > 0));
  });

  it("passes when the only high advisory is excepted, dev-only and not expired", () => {
    const result = evaluateAudit({ all: picomatchOnly, production: report({}), exceptions: [exception], today: "2026-11-18" });

    assert.equal(result.ok, true);
    assert.deepEqual(result.blocking, []);
    assert.deepEqual(result.ignored.map((entry) => entry.id), ["GHSA-fc5q-39xc-vjpf"]);
  });

  it("still passes on the expiry day", () => {
    const result = evaluateAudit({ all: picomatchOnly, production: report({}), exceptions: [exception], today: "2026-12-03" });

    assert.equal(result.ok, true);
  });

  it("fails after the exception expires", () => {
    const result = evaluateAudit({ all: picomatchOnly, production: report({}), exceptions: [exception], today: "2026-12-04" });

    assert.equal(result.ok, false);
    assert.deepEqual(result.blocking.map((entry) => entry.id), ["GHSA-fc5q-39xc-vjpf"]);
  });

  it("fails when the excepted advisory reaches a production dependency", () => {
    const result = evaluateAudit({ all: picomatchOnly, production: picomatchOnly, exceptions: [exception], today: "2026-11-18" });

    assert.equal(result.ok, false);
    assert.deepEqual(result.blocking.map((entry) => entry.id), ["GHSA-fc5q-39xc-vjpf"]);
  });

  it("fails on any other high or critical advisory next to the excepted one", () => {
    const all = report({
      ...picomatchOnly.vulnerabilities,
      undici: {
        name: "undici",
        severity: "critical",
        via: [{ source: 1, url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "critical" }],
      },
    });

    const result = evaluateAudit({ all, production: report({}), exceptions: [exception], today: "2026-11-18" });

    assert.equal(result.ok, false);
    assert.deepEqual(result.blocking.map((entry) => entry.id), ["GHSA-aaaa-bbbb-cccc"]);
  });

  it("does not block on moderate or low advisories", () => {
    const all = report({
      tar: { name: "tar", severity: "moderate", via: [{ source: 2, url: "https://github.com/advisories/GHSA-dddd-eeee-ffff", severity: "moderate" }] },
    });

    assert.equal(evaluateAudit({ all, production: report({}), exceptions: [], today: "2026-11-18" }).ok, true);
  });

  it("fails closed when npm audit returns an error instead of a report", () => {
    assert.throws(
      () => evaluateAudit({ all: { error: { code: "ENOAUDIT" } }, production: report({}), exceptions: [], today: "2026-11-18" }),
      /npm audit did not return a report/,
    );
  });
});
