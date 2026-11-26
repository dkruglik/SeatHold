import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { InMemorySessionRepository, InMemoryUserRepository, SequentialSessionTokens } from "./in-memory-auth-test-support.js";
import { SessionService } from "./session-service.js";

const T0 = new Date("2030-01-01T10:00:00.000Z");
const DAY_MS = 86_400_000;

async function setup(ttlDays = 30) {
  const clock = new ControlledClock(T0);
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository(users);
  const service = new SessionService({ clock, sessions, tokens: new SequentialSessionTokens(), ttlDays });
  const user = await users.createBuyer("ada@example.io", T0);
  return { clock, users, sessions, service, user };
}

describe("SessionService.create", () => {
  it("hands out the raw token, stores only its hash, and expires after the configured days from one clock read", async () => {
    const { sessions, service, user } = await setup(7);

    const created = await service.create(user.id);

    expect(created.token).toBe("token-1");
    expect(created.expiresAt).toEqual(new Date(T0.getTime() + 7 * DAY_MS));
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]?.tokenHash).toBe("hash(token-1)");
    expect(JSON.stringify(sessions.rows)).not.toContain('"token-1"');
  });

  it("gives every session its own token", async () => {
    const { service, user } = await setup();

    const first = await service.create(user.id);
    const second = await service.create(user.id);

    expect(second.token).not.toBe(first.token);
  });
});

describe("SessionService.authenticate", () => {
  it("returns the session and its user for a live token", async () => {
    const { service, user } = await setup();
    const { token } = await service.create(user.id);

    const active = await service.authenticate(token);

    expect(active?.user).toEqual(user);
  });

  it("returns null for an unknown token", async () => {
    const { service } = await setup();

    expect(await service.authenticate("nope")).toBeNull();
  });

  it("returns null once the lifetime has passed on the injected clock", async () => {
    const { clock, service, user } = await setup(1);
    const { token } = await service.create(user.id);
    clock.advance(DAY_MS);

    expect(await service.authenticate(token)).toBeNull();
  });

  it("reads the role fresh: a promotion shows on the next call", async () => {
    const { users, service, user } = await setup();
    const { token } = await service.create(user.id);

    await users.setRoleByEmail(user.email, "admin");

    expect((await service.authenticate(token))?.user.role).toBe("admin");
  });
});

describe("SessionService.revoke and revokeAll", () => {
  it("revoke ends one session and leaves the others", async () => {
    const { service, user } = await setup();
    const first = await service.create(user.id);
    const second = await service.create(user.id);
    const active = await service.authenticate(first.token);

    await service.revoke(active?.id ?? "");

    expect(await service.authenticate(first.token)).toBeNull();
    expect(await service.authenticate(second.token)).not.toBeNull();
  });

  it("revokeAll ends every session of the user and none of another user", async () => {
    const { users, service, user } = await setup();
    const other = await users.createBuyer("bob@example.io", T0);
    const mine = [await service.create(user.id), await service.create(user.id)];
    const theirs = await service.create(other.id);

    await service.revokeAll(user.id);

    for (const { token } of mine) {
      expect(await service.authenticate(token)).toBeNull();
    }
    expect(await service.authenticate(theirs.token)).not.toBeNull();
  });
});
