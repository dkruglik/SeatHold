import type { User } from "./user.js";

/** A session as stored. The token itself is never kept, only its hash. */
export class Session {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly createdAt: Date,
    readonly expiresAt: Date,
  ) {}
}

/** A session that is neither revoked nor expired, with the user it belongs to (role read fresh from the database). */
export class ActiveSession {
  constructor(
    readonly id: string,
    readonly expiresAt: Date,
    readonly user: User,
  ) {}
}
