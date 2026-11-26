import type { ChangeUserRoleService } from "../modules/auth/application/change-user-role-service.js";
import { isValidEmail } from "../modules/auth/domain/email.js";
import type { Role } from "../modules/auth/domain/role.js";
import type { CommandIo } from "./command-io.js";

const SCRIPT_OF: Readonly<Record<Role, string>> = { admin: "user:promote", buyer: "user:demote" };

export interface RoleCommandDeps {
  readonly changeRole: Pick<ChangeUserRoleService, "change">;
  readonly io: CommandIo;
}

/** `user:promote` (role admin) and `user:demote` (role buyer): one email argument; returns the exit code. */
export async function runRoleCommand(role: Role, argv: readonly string[], deps: RoleCommandDeps): Promise<number> {
  const { io } = deps;
  const [email, ...extra] = argv;
  if (email === undefined || extra.length > 0 || !isValidEmail(email)) {
    io.err(`Usage: npm run ${SCRIPT_OF[role]} -w backend -- <email>`);
    return 1;
  }
  const result = await deps.changeRole.change(email, role);
  if (result.status === "not_found") {
    io.err(`No user with email ${result.email}. The person must sign in once before they can be promoted or demoted.`);
    return 1;
  }
  io.out(`${result.email} ${result.status === "changed" ? "is now" : "is already"} ${role}`);
  return 0;
}
