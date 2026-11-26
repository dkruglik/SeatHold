import type { Role } from "../domain/role.js";
import type { UserRepository } from "./ports/user-repository.js";

export interface ChangeRoleResult {
  /** `unchanged`: the user already had the role. `not_found`: no user has that email. */
  readonly status: "changed" | "unchanged" | "not_found";
  /** The email as stored when the user exists, otherwise as given. */
  readonly email: string;
  readonly role: Role;
}

/**
 * Changes the role of an existing user: the only way a role changes besides the seed (DECISIONS.md O50).
 * The repository's `setRoleByEmail` returns false both for an unknown email and for a role already set, so the
 * user is looked up first to tell the two apart (O41).
 */
export class ChangeUserRoleService {
  constructor(private readonly deps: { readonly users: UserRepository }) {}

  async change(email: string, role: Role): Promise<ChangeRoleResult> {
    const user = await this.deps.users.findByEmail(email);
    if (user === null) {
      return { status: "not_found", email, role };
    }
    if (user.role === role) {
      return { status: "unchanged", email: user.email, role };
    }
    // False here means the role changed between the read and the write; the user has the role, as wanted.
    await this.deps.users.setRoleByEmail(user.email, role);
    return { status: "changed", email: user.email, role };
  }
}
