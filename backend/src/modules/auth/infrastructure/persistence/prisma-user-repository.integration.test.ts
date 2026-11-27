import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrisma, resetAuthTables } from "./auth-test-support.js";
import { PrismaUserRepository } from "./prisma-user-repository.js";

const NOW = new Date("2026-01-01T12:00:00Z");

describe("PrismaUserRepository", () => {
  const prisma = createTestPrisma();
  const users = new PrismaUserRepository(prisma);

  beforeAll(() => prisma.connect());
  afterAll(() => prisma.disconnect());
  beforeEach(() => resetAuthTables(prisma));

  it("creates a buyer and finds it by id and by email in any case", async () => {
    const created = await users.createBuyer("A@x.io", NOW);

    expect(created.role).toBe("buyer");
    expect(created.createdAt).toEqual(NOW);
    expect(await users.findById(created.id)).toEqual(created);
    expect((await users.findByEmail("a@X.IO"))?.id).toBe(created.id);
  });

  it("returns null for an unknown id or email", async () => {
    expect(await users.findById("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await users.findByEmail("nobody@x.io")).toBeNull();
  });

  it("returns the existing user when the same email is created again in another case", async () => {
    const first = await users.createBuyer("A@x.io", NOW);

    const second = await users.createBuyer("a@X.io", new Date(NOW.getTime() + 1000));

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toEqual(NOW);
  });

  it("yields one user for concurrent createBuyer calls", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => users.createBuyer("race@x.io", NOW)));

    expect(new Set(results.map((user) => user.id)).size).toBe(1);
    const rows = await prisma.client.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM users`;
    expect(rows[0]?.n).toBe(1);
  });

  it("sets the role by email and reports whether a row changed", async () => {
    await users.createBuyer("a@x.io", NOW);

    expect(await users.setRoleByEmail("A@X.io", "admin")).toBe(true);
    expect((await users.findByEmail("a@x.io"))?.role).toBe("admin");
    expect(await users.setRoleByEmail("a@x.io", "admin")).toBe(false);
    expect(await users.setRoleByEmail("missing@x.io", "admin")).toBe(false);
  });
});
