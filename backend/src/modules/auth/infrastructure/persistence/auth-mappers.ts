import type { AuthCode, Session as SessionRow, User as UserRow } from "../../../../generated/prisma/client.js";
import { InfrastructureError } from "../../../../shared/errors/app-error.js";
import { LoginCode } from "../../domain/login-code.js";
import { isRole } from "../../domain/role.js";
import { ActiveSession, Session } from "../../domain/session.js";
import { User } from "../../domain/user.js";

export function toUser(row: UserRow): User {
  if (!isRole(row.role)) throw new InfrastructureError("Persistence returned an unknown role");
  return new User(row.id, row.email, row.role, row.createdAt);
}

export function toLoginCode(row: AuthCode): LoginCode {
  return new LoginCode(row.id, row.email, row.codeHash, row.expiresAt, row.attempts, row.createdAt);
}

export function toSession(row: SessionRow): Session {
  return new Session(row.id, row.userId, row.createdAt, row.expiresAt);
}

export function toActiveSession(row: SessionRow & { user: UserRow }): ActiveSession {
  return new ActiveSession(row.id, row.expiresAt, toUser(row.user));
}
