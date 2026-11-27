import type { Clock } from "../../../shared/time/clock.js";
import type { Role } from "../domain/role.js";
import type { UserRepository } from "./ports/user-repository.js";

export interface SeedAccount {
  readonly email: string;
  readonly role: Role;
}

/** The local accounts (DECISIONS.md O51). Well-known emails: the seed never runs in production. */
export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { email: "admin@seathold.local", role: "admin" },
  { email: "buyer@seathold.local", role: "buyer" },
];

export interface SeedResult extends SeedAccount {
  readonly status: "created" | "exists";
}

/** Creates the seed accounts that are missing. An account that exists is left exactly as it is, whatever its role now. */
export class SeedUsersService {
  constructor(private readonly deps: { readonly users: UserRepository; readonly clock: Clock }) {}

  async seed(): Promise<SeedResult[]> {
    const results: SeedResult[] = [];
    for (const account of SEED_ACCOUNTS) {
      results.push({ ...account, status: await this.ensure(account) });
    }
    return results;
  }

  private async ensure({ email, role }: SeedAccount): Promise<SeedResult["status"]> {
    const { users, clock } = this.deps;
    if ((await users.findByEmail(email)) !== null) {
      return "exists";
    }
    await users.createBuyer(email, await clock.now());
    if (role !== "buyer") {
      await users.setRoleByEmail(email, role);
    }
    return "created";
  }
}
