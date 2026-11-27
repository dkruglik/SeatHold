import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./env-file.mjs";

// Paths the skill may name that the checkout does not contain: created by the skill itself.
const generatedPaths = new Set([".env"]);
// Backticked ALL_CAPS words that are shell or Homebrew variables, not .env keys.
const nonEnvKeys = new Set([]);
// Committed local placeholder values; a value starting with one of these is not a secret.
const placeholderPrefixes = ["local-only", "seatholder"];

export function loadRepoFacts(rootDir) {
  const readJson = (file) => JSON.parse(readFileSync(path.join(rootDir, file), "utf8"));
  return {
    rootDir,
    rootScripts: readJson("package.json").scripts,
    workspaceScripts: {
      backend: readJson("backend/package.json").scripts,
      frontend: readJson("frontend/package.json").scripts,
    },
    envKeys: new Set(Object.keys(parseEnvFile(readFileSync(path.join(rootDir, ".env.example"), "utf8")))),
  };
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) {
    return null;
  }
  const fields = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    fields[key.trim()] = rest.join(":").trim();
  }
  return fields;
}

function looksLikeRepoPath(token) {
  if (/[\s<>$*"'()]/.test(token) || token.startsWith("/") || token.startsWith("~") || token.includes("://")) {
    return false;
  }
  return token.includes("/") || /\.(md|mjs|json|ts|tsx|yml|yaml|example)$/.test(token) || token === ".env";
}

/** Returns a list of problems; an empty list means the skill agrees with the repository. */
export function checkInstallSkill(text, facts) {
  const problems = [];

  const fields = frontmatter(text);
  if (!fields?.name || !fields?.description) {
    problems.push("frontmatter must have name and description");
  }

  for (const [, name, workspace] of text.matchAll(/npm run ([\w:-]+)(?: -w (\w+))?/g)) {
    const scripts = workspace ? facts.workspaceScripts[workspace] : facts.rootScripts;
    if (!scripts) {
      problems.push(`unknown workspace ${workspace} for npm run ${name}`);
    } else if (!(name in scripts)) {
      problems.push(`npm run ${name}${workspace ? ` -w ${workspace}` : ""} is not a script`);
    }
  }

  for (const [, token] of text.matchAll(/`([^`\n]+)`/g)) {
    const key = /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:=.*)?$/.exec(token)?.[1];
    if (key && !nonEnvKeys.has(key) && !facts.envKeys.has(key)) {
      problems.push(`env key ${key} is not in .env.example`);
    }
    if (looksLikeRepoPath(token) && !generatedPaths.has(token) && !existsSync(path.join(facts.rootDir, token))) {
      problems.push(`path ${token} does not exist`);
    }
  }

  if (/\bsk-[A-Za-z0-9]/.test(text)) {
    problems.push("secret-looking token sk-...");
  }
  for (const [, key, value] of text.matchAll(/\b(\w*(?:PASSWORD|SECRET|PEPPER|TOKEN|API_KEY)\w*)=([A-Za-z0-9+/_-]{8,})/g)) {
    if (!placeholderPrefixes.some((prefix) => value.startsWith(prefix))) {
      problems.push(`secret-looking assignment to ${key}`);
    }
  }

  return problems;
}
