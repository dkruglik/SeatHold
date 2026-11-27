import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkInstallSkill, loadRepoFacts } from "./install-skill-check.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = ".claude/skills/install-seathold/SKILL.md";
const skill = readFileSync(path.join(rootDir, skillPath), "utf8");
const facts = loadRepoFacts(rootDir);

describe("install-seathold skill (static check, not a Mac run)", () => {
  it("has no problems against the repository", () => {
    assert.deepEqual(checkInstallSkill(skill, facts), []);
  });

  it("keeps the 11 numbered steps", () => {
    const section = skill.split("\n## Steps\n")[1]?.split("\n## ")[0] ?? "";
    const steps = [...section.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
    assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("has a demo script of 5 numbered steps", () => {
    const section = skill.split("\n## Demo script\n")[1]?.split("\n## ")[0] ?? "";
    assert.equal([...section.matchAll(/^\d+\. \*\*/gm)].length, 5);
  });

  it("has the demo script, timed run and clean up sections", () => {
    for (const heading of ["## Demo script", "## Timed run", "## Stop and clean up"]) {
      assert.ok(skill.includes(`\n${heading}\n`), `missing section ${heading}`);
    }
  });

  it("does not claim a timed run or a Mac run that did not happen", () => {
    assert.match(skill, /not yet run on a Mac/i);
    assert.match(skill, /<10 minutes|< 10 minutes/);
  });
});

describe("checkInstallSkill detects mistakes", () => {
  const good = "---\nname: x\ndescription: y\n---\n# T\n";
  const problems = (body) => checkInstallSkill(good + body, facts);

  it("accepts a clean skill body", () => {
    assert.deepEqual(problems("Run `npm run dev` and read `README.md`. Set `APP_ENV`.\n"), []);
  });

  it("flags a root script that does not exist", () => {
    assert.match(problems("Run `npm run no-such-script`.\n").join("\n"), /no-such-script/);
  });

  it("flags a workspace script that does not exist", () => {
    assert.match(problems("Run `npm run nope -w backend`.\n").join("\n"), /nope/);
  });

  it("accepts a workspace script that exists", () => {
    assert.deepEqual(problems("Run `npm run seed -w backend`.\n"), []);
  });

  it("flags an unknown env key", () => {
    assert.match(problems("Set `NOT_A_REAL_KEY`.\n").join("\n"), /NOT_A_REAL_KEY/);
  });

  it("flags a missing repository path", () => {
    assert.match(problems("See `backend/prisma/nothing-here`.\n").join("\n"), /nothing-here/);
  });

  it("flags missing frontmatter fields", () => {
    assert.match(checkInstallSkill("# no frontmatter\n", facts).join("\n"), /frontmatter/);
  });

  it("flags secret-looking content", () => {
    assert.match(problems("key sk-abcdefghijkl\n").join("\n"), /secret/);
    assert.match(problems("POSTGRES_PASSWORD=hunter2hunter2\n").join("\n"), /secret/);
    assert.match(problems("CSRF_SECRET=abcdef0123456789\n").join("\n"), /secret/);
  });

  it("allows a generated value and the committed local placeholder", () => {
    assert.deepEqual(problems("`CSRF_SECRET=$(openssl rand -hex 32)` and `grep -q ^CSRF_SECRET=local-only .env`\n"), []);
  });
});
