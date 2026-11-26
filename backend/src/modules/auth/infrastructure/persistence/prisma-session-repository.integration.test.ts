import { describe, expect, it } from "vitest";
import { useAuthDatabase } from "./auth-test-support.js";
import { PrismaSessionRepository } from "./prisma-session-repository.js";
import { PrismaUserRepository } from "./prisma-user-repository.js";

const T0 = new Date("2026-01-01T12:00:00Z");
const days = (base: Date, n: number) => new Date(base.getTime() + n * 86_400_000);

function setup() {
  const prisma = useAuthDatabase();
  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const open = (userId: string, tokenHash: string, ttlDays = 30) =>
    sessions.create({ userId, tokenHash, expiresAt: days(T0, ttlDays), now: T0 });
  return { prisma, users, sessions, open };
}

describe("PrismaSessionRepository: lookup", () => {
  const { users, sessions, open } = setup();

  it("finds an active session by token hash together with its user and role", async () => {
    const user = await users.createBuyer("a@x.io", T0);
    await users.setRoleByEmail("a@x.io", "admin");
    const created = await open(user.id, "hash-1");

    const found = await sessions.findActiveByTokenHash("hash-1", days(T0, 1));

    expect(found?.id).toBe(created.id);
    expect(found?.expiresAt).toEqual(days(T0, 30));
    expect(found?.user).toMatchObject({ id: user.id, email: "a@x.io", role: "admin" });
    expect(await sessions.findActiveByTokenHash("unknown", days(T0, 1))).toBeNull();
  });

  it("ignores expired sessions", async () => {
    const user = await users.createBuyer("a@x.io", T0);
    await open(user.id, "hash-1", 1);

    expect(await sessions.findActiveByTokenHash("hash-1", days(T0, 0.5))).not.toBeNull();
    expect(await sessions.findActiveByTokenHash("hash-1", days(T0, 1))).toBeNull();
  });

  it("ignores revoked sessions", async () => {
    const user = await users.createBuyer("a@x.io", T0);
    const session = await open(user.id, "hash-1");

    await sessions.revoke(session.id, days(T0, 1));

    expect(await sessions.findActiveByTokenHash("hash-1", days(T0, 2))).toBeNull();
  });

});

describe("PrismaSessionRepository: revocation and errors", () => {
  const { prisma, users, sessions, open } = setup();

  it("revokes every session of one user and leaves other users alone", async () => {
    const a = await users.createBuyer("a@x.io", T0);
    const b = await users.createBuyer("b@x.io", T0);
    await open(a.id, "a-1");
    await open(a.id, "a-2");
    await open(b.id, "b-1");

    await sessions.revokeAllForUser(a.id, days(T0, 1));

    expect(await sessions.findActiveByTokenHash("a-1", days(T0, 2))).toBeNull();
    expect(await sessions.findActiveByTokenHash("a-2", days(T0, 2))).toBeNull();
    expect(await sessions.findActiveByTokenHash("b-1", days(T0, 2))).not.toBeNull();
  });

  it("keeps the first revocation time when revoking twice", async () => {
    const user = await users.createBuyer("a@x.io", T0);
    const session = await open(user.id, "hash-1");

    await sessions.revoke(session.id, days(T0, 1));
    await sessions.revoke(session.id, days(T0, 2));

    const rows = await prisma.client.$queryRaw<{ revoked_at: Date }[]>`SELECT revoked_at FROM sessions`;
    expect(rows[0]?.revoked_at).toEqual(days(T0, 1));
  });

  it("translates a duplicate token hash into an InfrastructureError without SQL or values", async () => {
    const user = await users.createBuyer("a@x.io", T0);
    await open(user.id, "secret-hash");

    const failure = await open(user.id, "secret-hash").catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: "InfrastructureError", kind: "infrastructure" });
    expect((failure as Error).message).not.toMatch(/secret-hash|INSERT|sessions/i);
  });
});
