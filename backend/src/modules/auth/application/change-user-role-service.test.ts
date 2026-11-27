import { describe, expect, it } from "vitest";
import { ChangeUserRoleService } from "./change-user-role-service.js";
import { InMemoryUserRepository } from "./in-memory-auth-test-support.js";

const NOW = new Date("2030-01-01T10:00:00.000Z");

async function setup(): Promise<{ users: InMemoryUserRepository; service: ChangeUserRoleService }> {
  const users = new InMemoryUserRepository();
  await users.createBuyer("Ada@Example.io", NOW);
  return { users, service: new ChangeUserRoleService({ users }) };
}

describe("ChangeUserRoleService", () => {
  it("promotes an existing buyer and reports the stored email", async () => {
    const { users, service } = await setup();

    expect(await service.change("ada@example.IO", "admin")).toEqual({ status: "changed", email: "Ada@Example.io", role: "admin" });
    expect((await users.findByEmail("ada@example.io"))?.role).toBe("admin");
  });

  it("is a no-op success for a user who already has the role", async () => {
    const { users, service } = await setup();
    await service.change("ada@example.io", "admin");

    expect(await service.change("ada@example.io", "admin")).toEqual({ status: "unchanged", email: "Ada@Example.io", role: "admin" });
    expect((await users.findByEmail("ada@example.io"))?.role).toBe("admin");
  });

  it("demotes an admin to buyer, and demoting a buyer is a no-op", async () => {
    const { users, service } = await setup();
    await service.change("ada@example.io", "admin");

    expect((await service.change("ada@example.io", "buyer")).status).toBe("changed");
    expect((await service.change("ada@example.io", "buyer")).status).toBe("unchanged");
    expect((await users.findByEmail("ada@example.io"))?.role).toBe("buyer");
  });

  it("reports an unknown email as not_found and creates nobody", async () => {
    const { users, service } = await setup();

    expect(await service.change("nobody@example.io", "admin")).toEqual({ status: "not_found", email: "nobody@example.io", role: "admin" });
    expect(users.users).toHaveLength(1);
  });
});
