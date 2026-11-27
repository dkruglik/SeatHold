import { describe, expect, it } from "vitest";
import { runScript } from "./script-runtime.js";

function setup() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
}

describe("runScript", () => {
  it("exits 1 with the config error and never runs the body when the environment is invalid", async () => {
    const t = setup();
    let ran = false;

    const code = await runScript({}, t.io, () => { ran = true; return Promise.resolve(0); });

    expect(code).toBe(1);
    expect(ran).toBe(false);
    expect(t.err.join("\n")).toContain("DATABASE_URL");
  });
});
