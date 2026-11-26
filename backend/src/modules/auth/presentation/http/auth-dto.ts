import type { User } from "../../domain/user.js";

/** The user as the browser sees it: no created-at, no internals. */
export interface MeDto {
  readonly id: string;
  readonly email: string;
  readonly role: string;
}

export const toMeDto = (user: User): MeDto => ({ id: user.id, email: user.email, role: user.role });

/** JSON schema of `MeDto`, for response serialization. */
export const meSchema = {
  type: "object",
  properties: { id: { type: "string" }, email: { type: "string" }, role: { type: "string" } },
  required: ["id", "email", "role"],
} as const;
