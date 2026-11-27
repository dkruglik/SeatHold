import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { AuthenticationError, AuthorizationError } from "../../../../../shared/errors/app-error.js";
import type { Role } from "../../../domain/role.js";
import { User } from "../../../domain/user.js";
import { requireRole } from "./require-role.js";

const run = async (user: User | null, role: Role): Promise<void> => {
  await requireRole(role).call(undefined as never, { user } as FastifyRequest, {} as FastifyReply);
};
const userWith = (role: Role): User => new User("u1", "ada@example.io", role, new Date());

describe("requireRole", () => {
  it("lets a user with the required role through", async () => {
    await expect(run(userWith("admin"), "admin")).resolves.toBeUndefined();
  });

  it("refuses a user with another role as 403 FORBIDDEN_ROLE", async () => {
    const error = await run(userWith("buyer"), "admin").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthorizationError);
    expect((error as AuthorizationError).publicCode).toBe("FORBIDDEN_ROLE");
  });

  it("fails closed with 401 when no authenticated user is on the request (requireAuth was left out)", async () => {
    const error = await run(null, "admin").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as AuthenticationError).publicCode).toBe("UNAUTHENTICATED");
  });
});
