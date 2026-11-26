import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// `.cursor/` is canonical for rules, skills, and review agents. This script generates the Claude
// Code files from it. `.cursor/rules/15-ai-tool-parity.mdc` documents the rules.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Agent-requested rule with no Claude counterpart: Claude reaches the same review through the
// review-diff skill.
const cursorOnlyRules = new Set(["review.mdc"]);

// The Claude side of review-suite is the plugin command, so the Cursor skill is not mirrored.
const cursorOnlySkills = new Set(["review-suite"]);
// Committed Claude skills with no .cursor/ original: tracked by hand, never generated or removed.
const claudeOnlySkills = new Set(["install-seathold"]);

// The plugin's agent frontmatter. Model, color, and tools are Claude settings, not shared text.
export const claudeAgentFields = {
  "bugbot-reviewer": { model: "opus", color: "red", tools: ["Bash", "Glob", "Grep", "Read", "Skill"] },
  "code-reviewer": { model: "opus", color: "green", tools: ["Bash", "Glob", "Grep", "Read"] },
  "code-simplifier": { model: "opus", color: "blue", tools: ["Bash", "Glob", "Grep", "Read"] },
  "comment-analyzer": { model: "inherit", color: "green", tools: ["Bash", "Glob", "Grep", "Read"] },
  "ponytail-reviewer": { model: "inherit", color: "magenta", tools: ["Bash", "Glob", "Grep", "Read", "Skill"] },
  "security-auditor": { model: "opus", color: "red", tools: ["Bash", "Glob", "Grep", "Read", "Skill"] },
  "performance-auditor": { model: "inherit", color: "cyan", tools: ["Bash", "Glob", "Grep", "Read", "Skill"] },
  "silent-failure-hunter": { model: "inherit", color: "yellow", tools: ["Bash", "Glob", "Grep", "Read"] },
  "test-analyzer": { model: "inherit", color: "cyan", tools: ["Bash", "Glob", "Grep", "Read"] },
  "type-design-analyzer": { model: "inherit", color: "pink", tools: ["Bash", "Glob", "Grep", "Read"] },
};

const pluginAgentsDir = ".claude/marketplace/plugins/review-suite/agents";

export function splitFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  if (!match) {
    return { data: {}, body: normalized };
  }
  const data = {};
  for (const line of match[1].split("\n")) {
    const field = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (field) {
      data[field[1]] = field[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return { data, body: normalized.slice(match[0].length) };
}

// Splits "a/**,b/{x,y}" on commas outside braces.
export function splitGlobs(value) {
  const globs = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      globs.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim() !== "") {
    globs.push(current.trim());
  }
  return globs.filter((glob) => glob !== "");
}

export function transformReferences(text) {
  return text
    .replaceAll(".cursor/rules/", ".claude/rules/")
    .replaceAll(".cursor/skills/", ".claude/skills/")
    .replace(/(\d{2}-[a-z0-9-]+)\.mdc\b/g, "$1.md");
}

export function cursorRuleToClaude(text) {
  const { data, body } = splitFrontmatter(text);
  const alwaysApply = data.alwaysApply === "true";
  const globs = splitGlobs(data.globs ?? "");
  if (alwaysApply && globs.length > 0) {
    throw new Error("rule sets alwaysApply and globs together; a path-scoped rule must use alwaysApply: false");
  }
  if (!alwaysApply && globs.length === 0) {
    throw new Error("rule has neither alwaysApply: true nor globs; Claude would load it on every session");
  }
  const claudeBody = transformReferences(body).replace(/^\n+/, "").trimEnd() + "\n";
  if (globs.length === 0) {
    return claudeBody;
  }
  return `---\npaths: [${globs.map((glob) => JSON.stringify(glob)).join(", ")}]\n---\n\n${claudeBody}`;
}

export function cursorAgentToClaude(name, text) {
  const fields = claudeAgentFields[name];
  if (!fields) {
    throw new Error(`agent "${name}" has no Claude fields in claudeAgentFields`);
  }
  const { data, body } = splitFrontmatter(text);
  const description = agentReferences(data.description ?? "", "AGENT.md", "CLAUDE.md");
  const skillLoaded = fields.tools.includes("Skill")
    ? body.replace(
        /Read `\.cursor\/skills\/([^`]+)\/SKILL\.md` and follow it\./g,
        "Load the skill with the Skill tool. If the Skill tool is unavailable, read `.cursor/skills/$1/SKILL.md` and follow it.",
      )
    : body;
  const claudeBody = agentReferences(
    skillLoaded.replace(/^\n+/, "").trimEnd() + "\n",
    "`AGENT.md`",
    "`CLAUDE.md` and `AGENT.md`",
  );
  const tools = fields.tools.map((tool) => JSON.stringify(tool)).join(", ");
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `model: ${fields.model}`,
    `color: ${fields.color}`,
    `tools: [${tools}]`,
    "---",
    "",
    claudeBody,
  ].join("\n");
}

function agentReferences(text, from, to) {
  return transformReferences(text)
    .replace(/\/review-suite(?![:\w-])/g, "/review-suite:review")
    .replaceAll(from, to);
}

// Path scopes that may match no tracked file yet: the code they govern arrives in a later phase. One entry per glob.
// A glob that is on this list and matches a tracked file fails the check (remove the entry); so does a glob that is
// not on the list and matches nothing, and an entry that no rule uses.
export const unmatchedGlobAllowlist = [
  // Phase 1 (auth module, HTTP presentation, email, persistence adapters, first frontend feature service)
  { glob: "frontend/src/**/services/**", until: "phase 1 it-7: AuthApi feature service" },
  { glob: "frontend/**/auth/**", until: "phase 1: frontend auth state" },
  { glob: "backend/src/infrastructure/email/**", until: "phase 1: email providers" },
  { glob: "backend/src/modules/auth/presentation/http/**/*service-auth*", until: "phase 1 or later: service auth hook, only if built" },
  { glob: "backend/src/modules/auth/presentation/http/routes/internal-*", until: "phase 1 or later: internal service routes, only if built" },
  // Never in this repository
  { glob: "**/tests/**", until: "never: tests sit beside their sources, there is no tests/ directory" },
  { glob: "context/**", until: "never: product specifications are not part of this repository" },
];

// Git lists the tracked files; the glob check runs against them, not against the working tree.
function trackedFiles(root) {
  const result = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr || result.error?.message}`);
  }
  return result.stdout.split(/\r?\n/).filter((file) => file !== "");
}

// .cursor/ and .claude/rules/ are gitignored: a clean checkout (CI) has no canonical files, so there is nothing to mirror or validate.
export function hasCanonicalRules(root = rootDir) {
  return fs.existsSync(path.join(root, ".cursor/rules"));
}

// Returns human-readable errors for canonical rules that would load wrongly or match nothing.
export function validateRepository(root = rootDir, allowlist = unmatchedGlobAllowlist) {
  if (!hasCanonicalRules(root)) {
    return [];
  }
  const errors = [];
  const tracked = trackedFiles(root);
  const allowed = new Set(allowlist.map((entry) => entry.glob));
  const used = new Set();
  for (const file of listFiles(path.join(root, ".cursor/rules"), ".mdc")) {
    if (cursorOnlyRules.has(file)) {
      continue;
    }
    const { data } = splitFrontmatter(readText(path.join(root, ".cursor/rules", file)));
    const alwaysApply = data.alwaysApply === "true";
    const globs = splitGlobs(data.globs ?? "");
    if (alwaysApply && globs.length > 0) {
      errors.push(`.cursor/rules/${file}: alwaysApply and globs are both set`);
    }
    for (const glob of globs) {
      used.add(glob);
      const matches = tracked.some((candidate) => path.matchesGlob(candidate, glob));
      if (!matches && !allowed.has(glob)) {
        errors.push(`.cursor/rules/${file}: glob "${glob}" matches no tracked file`);
      }
    }
  }
  for (const { glob } of allowlist) {
    if (!used.has(glob)) {
      errors.push(`glob "${glob}" is on the unmatched-glob allowlist but no rule uses it; remove the entry`);
    } else if (tracked.some((candidate) => path.matchesGlob(candidate, glob))) {
      errors.push(`glob "${glob}" is on the unmatched-glob allowlist but matches a tracked file; remove the entry`);
    }
  }
  return errors;
}

// The files the generator would write, and the Claude files it would remove as stale.
export function planMirror(root = rootDir) {
  const writes = new Map();
  const removals = [];

  const ruleNames = listFiles(path.join(root, ".cursor/rules"), ".mdc").filter((file) => !cursorOnlyRules.has(file));
  for (const file of ruleNames) {
    const source = readText(path.join(root, ".cursor/rules", file));
    writes.set(`.claude/rules/${file.replace(/\.mdc$/, ".md")}`, cursorRuleToClaude(source));
  }
  const expectedRules = new Set(ruleNames.map((file) => file.replace(/\.mdc$/, ".md")));
  for (const file of listFiles(path.join(root, ".claude/rules"), ".md")) {
    if (!expectedRules.has(file)) {
      removals.push(`.claude/rules/${file}`);
    }
  }

  // A skill is a folder: SKILL.md plus any reference files and scripts it names. Markdown references are
  // rewritten like SKILL.md; every other file is copied byte for byte.
  const skillNames = listDirs(path.join(root, ".cursor/skills")).filter((name) => !cursorOnlySkills.has(name));
  for (const name of skillNames) {
    const skillFiles = listTree(path.join(root, ".cursor/skills", name));
    const expected = new Set(skillFiles);
    for (const file of skillFiles) {
      const source = readText(path.join(root, ".cursor/skills", name, file));
      const content = file.endsWith(".md") ? transformReferences(source) : source;
      writes.set(`.claude/skills/${name}/${file}`, content);
    }
    for (const file of listTree(path.join(root, ".claude/skills", name))) {
      if (!expected.has(file)) {
        removals.push(`.claude/skills/${name}/${file}`);
      }
    }
  }
  for (const name of listDirs(path.join(root, ".claude/skills"))) {
    if (!skillNames.includes(name) && !claudeOnlySkills.has(name)) {
      removals.push(`.claude/skills/${name}`);
    }
  }

  const agentNames = listFiles(path.join(root, ".cursor/agents"), ".md");
  for (const file of agentNames) {
    const source = readText(path.join(root, ".cursor/agents", file));
    writes.set(`${pluginAgentsDir}/${file}`, cursorAgentToClaude(file.replace(/\.md$/, ""), source));
  }
  for (const file of listFiles(path.join(root, pluginAgentsDir), ".md")) {
    if (!agentNames.includes(file)) {
      removals.push(`${pluginAgentsDir}/${file}`);
    }
  }

  return { writes, removals };
}

// Repo-relative paths whose content differs from the Cursor canonical files, or that should not exist.
export function findDrift(root = rootDir) {
  if (!hasCanonicalRules(root)) {
    return [];
  }
  const { writes, removals } = planMirror(root);
  const drift = [];
  for (const [file, content] of writes) {
    const current = readIfExists(path.join(root, file));
    if (current === null || normalizeEol(current) !== normalizeEol(content)) {
      drift.push(file);
    }
  }
  for (const file of removals) {
    if (fs.existsSync(path.join(root, file))) {
      drift.push(file);
    }
  }
  return drift;
}

export function applyMirror(root = rootDir) {
  const { writes, removals } = planMirror(root);
  for (const file of removals) {
    fs.rmSync(path.join(root, file), { recursive: true, force: true });
  }
  // Git stores these files with LF. A file whose content already matches is left alone, so a
  // line-ending difference alone never rewrites it.
  const written = [];
  for (const [file, content] of writes) {
    const target = path.join(root, file);
    const current = readIfExists(target);
    if (current !== null && normalizeEol(current) === normalizeEol(content)) {
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, normalizeEol(content));
    written.push(file);
  }
  return { written, removed: removals };
}

function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function readIfExists(file) {
  return fs.existsSync(file) ? readText(file) : null;
}

function listFiles(dir, extension) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name)
    .sort();
}

// Every regular file under dir, as POSIX paths relative to dir, sorted.
function listTree(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort();
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function main(argv) {
  if (argv.includes("--write")) {
    const { written, removed } = applyMirror(rootDir);
    console.log(`wrote ${written.length} file(s), removed ${removed.length} stale path(s)`);
    for (const file of written) console.log(`  ${file}`);
    for (const file of removed) console.log(`  removed ${file}`);
    return 0;
  }
  if (argv.includes("--check")) {
    if (!hasCanonicalRules(rootDir)) {
      console.log("AI rules: .cursor/rules is not in this checkout, skipping the mirror and path-scope checks");
      return 0;
    }
    const errors = validateRepository(rootDir);
    const drift = findDrift(rootDir);
    if (errors.length === 0 && drift.length === 0) {
      console.log("AI rules: .claude/ mirrors .cursor/ and every path scope matches a tracked file or is allowlisted");
      return 0;
    }
    for (const error of errors) console.error(`error: ${error}`);
    for (const file of drift) console.error(`drift: ${file} (run: node scripts/sync-ai-rules.mjs --write)`);
    return 1;
  }
  console.error("usage: node scripts/sync-ai-rules.mjs --write | --check");
  return 2;
}

function isDirectRun() {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  process.exitCode = main(process.argv.slice(2));
}
