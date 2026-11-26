import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  cursorAgentToClaude,
  cursorRuleToClaude,
  findDrift,
  splitFrontmatter,
  splitGlobs,
  transformReferences,
  unmatchedGlobAllowlist,
  validateRepository,
} from "./sync-ai-rules.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), "utf8");
}

describe("splitGlobs", () => {
  it("splits on top-level commas and keeps brace alternatives together", () => {
    assert.deepEqual(splitGlobs("**/*.{test,spec}.{ts,tsx},**/tests/**,**/vitest.config.*"), [
      "**/*.{test,spec}.{ts,tsx}",
      "**/tests/**",
      "**/vitest.config.*",
    ]);
  });

  it("returns no globs for an empty value", () => {
    assert.deepEqual(splitGlobs(""), []);
  });
});

describe("transformReferences", () => {
  it("maps rule, skill, and rule-file references to the Claude tree", () => {
    assert.equal(
      transformReferences("See `.cursor/rules/20-backend-architecture.mdc` and `.cursor/skills/verify/SKILL.md`."),
      "See `.claude/rules/20-backend-architecture.md` and `.claude/skills/verify/SKILL.md`.",
    );
    assert.equal(transformReferences("see `40-security-general.mdc`"), "see `40-security-general.md`");
  });

  it("leaves the shared review contract and the plans location alone", () => {
    const text = "`.cursor/BUGBOT.md`, `backend/.cursor/BUGBOT.md`, `plans/x.plan.md`, `review.mdc`";
    assert.equal(transformReferences(text), text);
  });
});

describe("cursorRuleToClaude", () => {
  it("turns a path-scoped rule into a paths frontmatter with the same globs", () => {
    const output = cursorRuleToClaude(
      "---\ndescription: TypeScript style\nalwaysApply: false\nglobs: \"**/*.{ts,tsx}\"\n---\n\n# TypeScript\n",
    );
    assert.equal(output, '---\npaths: ["**/*.{ts,tsx}"]\n---\n\n# TypeScript\n');
  });

  it("writes an always-on rule without frontmatter", () => {
    const output = cursorRuleToClaude("---\ndescription: Governance\nalwaysApply: true\n---\n\n# Governance\n");
    assert.equal(output, "# Governance\n");
  });

  it("rejects a rule that sets both alwaysApply and a path scope", () => {
    assert.throws(
      () => cursorRuleToClaude("---\nalwaysApply: true\nglobs: backend/**\n---\n\n# X\n"),
      /alwaysApply and globs/,
    );
  });
});

describe("cursorAgentToClaude", () => {
  it("uses the Claude model, color, and tools of the review plugin", () => {
    const output = cursorAgentToClaude(
      "bugbot-reviewer",
      "---\nname: bugbot-reviewer\ndescription: Runs the `.cursor/rules/` checks.\nmodel: inherit\nreadonly: true\n---\n\nBody with `.cursor/rules/00-governance.mdc`.\n",
    );
    assert.match(output, /^---\nname: bugbot-reviewer\n/);
    assert.match(output, /description: Runs the `\.claude\/rules\/` checks\./);
    assert.match(output, /model: opus\ncolor: red\ntools: \["Bash", "Glob", "Grep", "Read", "Skill"\]\n---/);
    assert.match(output, /`\.claude\/rules\/00-governance\.md`/);
    assert.ok(!output.includes("readonly"));
  });

  it("loads a skill with the Skill tool when the agent has it, and reads the file otherwise", () => {
    const body = "1. Read `.cursor/skills/code-review/SKILL.md` and follow it.\n";
    const withSkill = cursorAgentToClaude("bugbot-reviewer", `---\nname: bugbot-reviewer\ndescription: x\n---\n\n${body}`);
    assert.match(
      withSkill,
      /Load the skill with the Skill tool\. If the Skill tool is unavailable, read `\.claude\/skills\/code-review\/SKILL\.md` and follow it\./,
    );
    const withoutSkill = cursorAgentToClaude("comment-analyzer", `---\nname: comment-analyzer\ndescription: x\n---\n\n${body}`);
    assert.match(withoutSkill, /Read `\.claude\/skills\/code-review\/SKILL\.md` and follow it\./);
  });

  it("rejects an agent that has no Claude fields", () => {
    assert.throws(
      () => cursorAgentToClaude("unknown-agent", "---\nname: unknown-agent\ndescription: x\n---\n\nbody\n"),
      /no Claude fields/,
    );
  });
});

describe("splitFrontmatter", () => {
  it("returns the body when there is no frontmatter", () => {
    assert.deepEqual(splitFrontmatter("# Title\n"), { data: {}, body: "# Title\n" });
  });
});

describe("checkout without the local agent tooling", () => {
  // .cursor/ and .claude/rules/ are gitignored, so a clean checkout (CI) has neither; the check skips cleanly.
  it("reports no drift and no errors when .cursor/rules does not exist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "seatholder-clean-"));
    try {
      fs.mkdirSync(path.join(root, ".claude/skills/install-seathold"), { recursive: true });
      fs.writeFileSync(path.join(root, ".claude/skills/install-seathold/SKILL.md"), "# skill\n");

      assert.deepEqual(findDrift(root), []);
      assert.deepEqual(validateRepository(root), []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("path scopes that match no tracked file", () => {
  // A throwaway git repository with one canonical rule that has the given globs and these tracked files.
  function withRepo(globs, files, run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "seatholder-globs-"));
    try {
      fs.mkdirSync(path.join(root, ".cursor/rules"), { recursive: true });
      fs.writeFileSync(path.join(root, ".cursor/rules/50-x.mdc"), `---\nalwaysApply: false\nglobs: ${globs.join(",")}\n---\n\n# X\n`);
      for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), "x\n");
      }
      spawnSync("git", ["init", "-q"], { cwd: root });
      spawnSync("git", ["add", "-A", "--force"], { cwd: root });
      run(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  it("fails a glob that matches nothing and is not on the allowlist", () => {
    withRepo(["backend/src/nothing/**"], ["README.md"], (root) => {
      assert.deepEqual(validateRepository(root, []), [
        '.cursor/rules/50-x.mdc: glob "backend/src/nothing/**" matches no tracked file',
      ]);
    });
  });

  it("accepts an allowlisted glob that matches nothing yet", () => {
    withRepo(["backend/src/later/**"], ["README.md"], (root) => {
      assert.deepEqual(validateRepository(root, [{ glob: "backend/src/later/**", until: "phase 9" }]), []);
    });
  });

  it("fails an allowlisted glob that now matches a tracked file, so the list shrinks", () => {
    withRepo(["backend/src/later/**"], ["backend/src/later/a.ts"], (root) => {
      const errors = validateRepository(root, [{ glob: "backend/src/later/**", until: "phase 9" }]);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /"backend\/src\/later\/\*\*" is on the unmatched-glob allowlist but matches a tracked file/);
    });
  });

  it("fails an allowlist entry that no rule uses any more", () => {
    withRepo(["README.md"], ["README.md"], (root) => {
      const errors = validateRepository(root, [{ glob: "gone/**", until: "phase 9" }]);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /"gone\/\*\*" is on the unmatched-glob allowlist but no rule uses it/);
    });
  });

  it("keeps the real allowlist explicit: one entry per glob, each naming when its files arrive", () => {
    const globs = unmatchedGlobAllowlist.map((entry) => entry.glob);
    assert.equal(new Set(globs).size, globs.length);
    assert.ok(unmatchedGlobAllowlist.length > 0);
    for (const entry of unmatchedGlobAllowlist) {
      assert.match(entry.until, /\S/, `${entry.glob} needs a reason`);
    }
  });
});

describe("repository state", () => {
  const hasCursorTree = fs.existsSync(path.join(rootDir, ".cursor/rules"));
  const localOnly = { skip: hasCursorTree ? false : ".cursor/rules is not in this checkout" };

  it("keeps the Claude tree a faithful mirror of the Cursor canonical files", localOnly, () => {
    assert.deepEqual(findDrift(rootDir), []);
  });

  it("has no rule whose path scope matches no tracked file", localOnly, () => {
    assert.deepEqual(validateRepository(rootDir), []);
  });

  it("loads only the approved rules on every session", localOnly, () => {
    const alwaysOn = fs
      .readdirSync(path.join(rootDir, ".cursor/rules"))
      .filter((file) => file.endsWith(".mdc"))
      .filter((file) => /^alwaysApply: true$/m.test(splitFrontmatterText(read(`.cursor/rules/${file}`))))
      .map((file) => file.slice(0, 2))
      .sort();
    assert.deepEqual(alwaysOn, ["00", "01", "15", "16", "17", "40", "80", "81"]);
  });

  it("denies secret env files at any depth in Claude and Cursor and keeps the example templates readable", () => {
    const secretNames = [".env", ".env.local", ".env.*.local", ".env.docker.local"];
    const examples = [".env.example", ".env.local.example", ".env.docker.local.example"];
    const cursorIgnore = fs.existsSync(path.join(rootDir, ".cursorignore")) ? read(".cursorignore").split(/\r?\n/) : null;
    const claudeDeny = JSON.parse(read(".claude/settings.json")).permissions.deny;

    // Claude: each secret name is denied at the root and at any depth.
    for (const name of secretNames) {
      assert.ok(claudeDeny.includes(`Read(./${name})`), `Read(./${name}) missing`);
      assert.ok(claudeDeny.includes(`Read(./**/${name})`), `Read(./**/${name}) missing`);
      assert.ok(cursorIgnore === null || cursorIgnore.includes(name), `${name} missing from .cursorignore`);
    }

    // Claude: no broad .env* wildcard, so other files such as .env.manager stay readable.
    assert.deepEqual(
      claudeDeny.filter((rule) => rule === "Read(./**/.env*)" || rule === "Read(./.env*)"),
      [],
    );

    // Claude: examples are re-allowed after every deny rule (extra Read(!...) entries are allowed).
    const lastDeny = Math.max(
      ...claudeDeny.map((rule, index) => (rule.startsWith("Read(") && !rule.startsWith("Read(!") ? index : -1)),
    );
    for (const example of examples) {
      const index = claudeDeny.indexOf(`Read(!${example})`);
      assert.ok(index > lastDeny, `Read(!${example}) must come after the deny rules`);
    }

    // Cursor: still uses the broad pattern, with exactly the three examples after it.
    // .cursorignore is Cursor-local and not tracked, so a clean checkout has none.
    if (cursorIgnore === null) {
      return;
    }
    const broadCursor = cursorIgnore.indexOf("**/.env*");
    assert.ok(broadCursor >= 0);
    assert.deepEqual(
      cursorIgnore.filter((line) => line.startsWith("!")),
      examples.map((example) => `!${example}`),
    );
    for (const example of examples) {
      assert.ok(cursorIgnore.indexOf(`!${example}`) > broadCursor);
    }
  });
});

function splitFrontmatterText(text) {
  return /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, "\n"))?.[1] ?? "";
}
