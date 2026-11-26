import { describe, expect, it } from "vitest";
import { ChangeUserRoleService } from "../modules/auth/application/change-user-role-service.js";
import { SeedUsersService } from "../modules/auth/application/seed-users-service.js";
import { PrismaUserRepository } from "../modules/auth/index.js";
import { useAuthDatabase } from "../modules/auth/infrastructure/persistence/auth-test-support.js";
import { ControlledClock } from "../shared/time/controlled-clock.js";
import { runRoleCommand } from "./role-command.js";
import { runSeedCommand } from "./seed-command.js";

const NOW = new Date("2030-01-01T10:00:00.000Z");

describe("the user:promote, user:demote and seed commands on the database", () => {
  const prisma = useAuthDatabase();
  const users = new PrismaUserRepository(prisma);
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (line: string) => out.push(line), err: (line: string) => err.push(line) };
  const role = (email: string) => users.findByEmail(email).then((user) => user?.role ?? null);
  const seed = () => runSeedCommand({ appEnv: "local", seed: new SeedUsersService({ users, clock: new ControlledClock(NOW) }), io });
  const change = (to: "admin" | "buyer", email: string) => runRoleCommand(to, [email], { changeRole: new ChangeUserRoleService({ users }), io });
  const counts = () => prisma.client.user.count();

  it("promotes an existing user, treats a second promote as success, and demotes back", async () => {
    await users.createBuyer("ada@example.io", NOW);

    expect(await change("admin", "ADA@example.io")).toBe(0);
    expect(await role("ada@example.io")).toBe("admin");
    expect(await change("admin", "ada@example.io")).toBe(0);
    expect(out.at(-1)).toBe("ada@example.io is already admin");
    expect(await change("buyer", "ada@example.io")).toBe(0);
    expect(await role("ada@example.io")).toBe("buyer");
    expect(await change("buyer", "ada@example.io")).toBe(0);
    expect(out.at(-1)).toBe("ada@example.io is already buyer");
  });

  it("fails for an unknown email and creates no user", async () => {
    expect(await change("admin", "nobody@example.io")).toBe(1);
    expect(err.at(-1)).toContain("No user with email nobody@example.io");
    expect(await counts()).toBe(0);
  });

  it("seeds the admin and the buyer once; a second run changes nothing", async () => {
    expect(await seed()).toBe(0);
    expect([await role("admin@seathold.local"), await role("buyer@seathold.local"), await counts()]).toEqual(["admin", "buyer", 2]);

    expect(await seed()).toBe(0);
    expect([await role("admin@seathold.local"), await role("buyer@seathold.local"), await counts()]).toEqual(["admin", "buyer", 2]);
  });

  it("leaves a role alone that someone changed after seeding", async () => {
    await seed();
    await change("admin", "buyer@seathold.local");
    await change("buyer", "admin@seathold.local");

    await seed();

    expect([await role("admin@seathold.local"), await role("buyer@seathold.local")]).toEqual(["buyer", "admin"]);
  });
});
