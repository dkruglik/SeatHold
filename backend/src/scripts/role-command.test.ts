import { describe, expect, it } from "vitest";
import type { ChangeRoleResult } from "../modules/auth/application/change-user-role-service.js";
import type { Role } from "../modules/auth/domain/role.js";
import { runRoleCommand } from "./role-command.js";

function setup(result: ChangeRoleResult | Error) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: Array<[string, Role]> = [];
  const changeRole = {
    change: (email: string, role: Role) => {
      calls.push([email, role]);
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
  };
  return { out, err, calls, run: (role: Role, argv: string[]) => runRoleCommand(role, argv, { changeRole, io: { out: (l) => out.push(l), err: (l) => err.push(l) } }) };
}

describe("runRoleCommand", () => {
  it("prints the usage and exits 1 without an email", async () => {
    const t = setup({ status: "changed", email: "a@b.io", role: "admin" });

    expect(await t.run("admin", [])).toBe(1);
    expect(t.err).toEqual(["Usage: npm run user:promote -w backend -- <email>"]);
    expect(t.calls).toEqual([]);
  });

  it("prints the demote usage for the demote command, and rejects extra arguments and a malformed email", async () => {
    const t = setup({ status: "changed", email: "a@b.io", role: "buyer" });

    expect(await t.run("buyer", ["a@b.io", "extra"])).toBe(1);
    expect(await t.run("buyer", ["not-an-email"])).toBe(1);
    expect(t.err).toEqual(Array(2).fill("Usage: npm run user:demote -w backend -- <email>"));
    expect(t.calls).toEqual([]);
  });

  it("prints the change and exits 0", async () => {
    const t = setup({ status: "changed", email: "ada@example.io", role: "admin" });

    expect(await t.run("admin", ["ada@example.io"])).toBe(0);
    expect(t.out).toEqual(["ada@example.io is now admin"]);
    expect(t.calls).toEqual([["ada@example.io", "admin"]]);
  });

  it("says already admin and exits 0 when nothing changed", async () => {
    const t = setup({ status: "unchanged", email: "ada@example.io", role: "admin" });

    expect(await t.run("admin", ["ada@example.io"])).toBe(0);
    expect(t.out).toEqual(["ada@example.io is already admin"]);
  });

  it("names the unknown email and exits 1", async () => {
    const t = setup({ status: "not_found", email: "nobody@example.io", role: "admin" });

    expect(await t.run("admin", ["nobody@example.io"])).toBe(1);
    expect(t.err).toEqual(["No user with email nobody@example.io. The person must sign in once before they can be promoted or demoted."]);
    expect(t.out).toEqual([]);
  });
});
