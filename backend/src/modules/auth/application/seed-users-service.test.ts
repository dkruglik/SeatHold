import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { InMemoryUserRepository } from "./in-memory-auth-test-support.js";
import { SEED_ACCOUNTS, SeedUsersService } from "./seed-users-service.js";

const NOW = new Date("2030-01-01T10:00:00.000Z");

function setup(): { users: InMemoryUserRepository; service: SeedUsersService } {
  const users = new InMemoryUserRepository();
  return { users, service: new SeedUsersService({ users, clock: new ControlledClock(NOW) }) };
}

const snapshot = (users: InMemoryUserRepository): string[] => users.users.map((user) => `${user.email}:${user.role}`).sort();

describe("SeedUsersService", () => {
  it("names the two local accounts", () => {
    expect(SEED_ACCOUNTS).toEqual([
      { email: "admin@seathold.local", role: "admin" },
      { email: "buyer@seathold.local", role: "buyer" },
    ]);
  });

  it("creates the admin and the buyer", async () => {
    const { users, service } = setup();

    const results = await service.seed();

    expect(results).toEqual([
      { email: "admin@seathold.local", role: "admin", status: "created" },
      { email: "buyer@seathold.local", role: "buyer", status: "created" },
    ]);
    expect(snapshot(users)).toEqual(["admin@seathold.local:admin", "buyer@seathold.local:buyer"]);
  });

  it("changes nothing when run again", async () => {
    const { users, service } = setup();
    await service.seed();
    const before = snapshot(users);

    const results = await service.seed();

    expect(results.map((result) => result.status)).toEqual(["exists", "exists"]);
    expect(snapshot(users)).toEqual(before);
  });

  it("never promotes a seeded buyer nor demotes a seeded admin that someone changed", async () => {
    const { users, service } = setup();
    await service.seed();
    await users.setRoleByEmail("buyer@seathold.local", "admin");
    await users.setRoleByEmail("admin@seathold.local", "buyer");

    await service.seed();

    expect(snapshot(users)).toEqual(["admin@seathold.local:buyer", "buyer@seathold.local:admin"]);
  });
});
