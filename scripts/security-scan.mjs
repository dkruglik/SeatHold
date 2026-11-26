import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmJsCli } from "./spawn-command-line.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const semgrepImage = "semgrep/semgrep:1.185.0";

export const semgrepConfigs = [
  "p/javascript",
  "p/typescript",
  "p/nodejs",
  "p/react",
  "p/owasp-top-ten",
  "p/docker",
  "p/secrets",
];

export const semgrepExcludes = [
  "node_modules",
  "dist",
  ".npm",
  "backend/src/generated",
  "coverage",
];

export const securityChecks = ["semgrep", "audit"];

// Dated exceptions for high or critical advisories that have no fixed release. Each one is ignored only while it
// reaches dev dependencies alone and only until its expiry day (inclusive, UTC); after that the scan fails again.
export const auditExceptions = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    expires: "2026-12-03",
    reason:
      "ReDoS in picomatch <=4.0.7 with no fixed release yet; reaches only dev tooling (vite, vitest, tinyglobby, fdir). Remove once a patched picomatch is published.",
  },
];

const blockingSeverities = new Set(["high", "critical"]);

function advisoryId(via) {
  const match = /GHSA-[a-z0-9-]+$/i.exec(via.url ?? "");
  return match ? match[0] : String(via.source);
}

function blockingAdvisories(auditReport) {
  if (typeof auditReport?.vulnerabilities !== "object" || auditReport.vulnerabilities === null) {
    throw new Error("npm audit did not return a report");
  }
  const found = new Map();
  for (const vulnerability of Object.values(auditReport.vulnerabilities)) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== "object" || !blockingSeverities.has(via.severity)) continue;
      const id = advisoryId(via);
      found.set(id, { id, package: vulnerability.name, severity: via.severity, url: via.url });
    }
  }
  return found;
}

// `all` is `npm audit --json`, `production` the same with `--omit=dev`. `today` is YYYY-MM-DD in UTC.
export function evaluateAudit({ all, production, exceptions, today }) {
  const advisories = blockingAdvisories(all);
  const inProduction = blockingAdvisories(production);
  const blocking = [];
  const ignored = [];
  for (const advisory of advisories.values()) {
    const exception = exceptions.find((entry) => entry.id === advisory.id);
    if (exception !== undefined && today <= exception.expires && !inProduction.has(advisory.id)) {
      ignored.push({ ...advisory, expires: exception.expires });
    } else {
      blocking.push(advisory);
    }
  }
  return { ok: blocking.length === 0, blocking, ignored };
}

export function semgrepScanArgs() {
  return [
    "scan",
    "--metrics=off",
    "--error",
    ...semgrepConfigs.flatMap((config) => ["--config", config]),
    ...semgrepExcludes.flatMap((exclude) => ["--exclude", exclude]),
  ];
}

export function toDockerVolumePath(resolvedPath, platform = process.platform) {
  if (platform !== "win32") {
    return resolvedPath;
  }
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(resolvedPath);
  if (!match) {
    return resolvedPath.replaceAll("\\", "/");
  }
  return `/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

export function parseSecurityArgs(argv) {
  const options = { checks: [...securityChecks], native: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      const check = argv[index + 1];
      if (!securityChecks.includes(check)) {
        throw new Error(`Unknown check: ${check}`);
      }
      options.checks = [check];
      index += 1;
    } else if (arg === "--native") {
      options.native = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

export function semgrepRunPlan({ native, volume }) {
  if (native) {
    return { command: "semgrep", args: semgrepScanArgs() };
  }
  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "-v",
      `${volume}:/src`,
      "-w",
      "/src",
      semgrepImage,
      "semgrep",
      ...semgrepScanArgs(),
    ],
  };
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    env: process.env,
    windowsHide: true,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runSemgrep(native) {
  const volume = toDockerVolumePath(path.resolve(rootDir));
  const plan = semgrepRunPlan({ native, volume });
  runCommand(plan.command, plan.args);
}

// npm audit exits non-zero whenever it finds anything, so the verdict comes from the JSON report, not the status.
function npmAuditReport(extraArgs) {
  const result = spawnSync(process.execPath, [resolveNpmJsCli("npm"), "audit", "--json", ...extraArgs], {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    env: process.env,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("npm audit did not return a report");
  }
}

function runNpmAudit() {
  let result;
  try {
    result = evaluateAudit({
      all: npmAuditReport([]),
      production: npmAuditReport(["--omit=dev"]),
      exceptions: auditExceptions,
      today: new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  for (const entry of result.ignored) {
    console.warn(`npm audit: ignoring ${entry.id} (${entry.package}, dev dependencies only) until ${entry.expires}`);
  }
  if (!result.ok) {
    for (const entry of result.blocking) {
      console.error(`npm audit: ${entry.severity} ${entry.id} in ${entry.package} ${entry.url ?? ""}`.trim());
    }
    process.exit(1);
  }
  console.log("npm audit: no blocking high or critical advisories");
}

function runSecurityScan(options) {
  for (const check of options.checks) {
    if (check === "semgrep") {
      runSemgrep(options.native);
    } else {
      runNpmAudit();
    }
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  let options;
  try {
    options = parseSecurityArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  runSecurityScan(options);
}
