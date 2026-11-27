import type { Role } from "./role.js";

export class User {
  constructor(
    readonly id: string,
    readonly email: string,
    readonly role: Role,
    readonly createdAt: Date,
  ) {}
}
