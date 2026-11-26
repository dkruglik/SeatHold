import type { Role } from "../../domain/role.js";
import type { User } from "../../domain/user.js";

/** Persistence port for users. Email matching is case-insensitive. Failures throw InfrastructureError. */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Creates a buyer, or returns the existing user of that email. Safe under concurrent calls: one user results. */
  createBuyer(email: string, now: Date): Promise<User>;
  /** Returns true when a row changed, false for an unknown email or a role already set. */
  setRoleByEmail(email: string, role: Role): Promise<boolean>;
}
