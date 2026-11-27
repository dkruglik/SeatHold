import type { onRequestAsyncHookHandler } from "fastify";
import { AuthenticationError, AuthorizationError } from "../../../../../shared/errors/app-error.js";
import type { Role } from "../../../domain/role.js";

/**
 * Rejects with 403 FORBIDDEN_ROLE unless the signed-in user has `role`. Runs after `requireAuth`: it reads
 * `request.user`, which `requireAuth` loaded from the database for this request, so a role change applies on the
 * next request. Without a user (requireAuth left out) it fails closed with 401.
 */
export function requireRole(role: Role): onRequestAsyncHookHandler {
  return async (request) => {
    if (request.user === null) {
      throw new AuthenticationError("Authentication required", { publicCode: "UNAUTHENTICATED" });
    }
    if (request.user.role !== role) {
      throw new AuthorizationError("Insufficient role", { publicCode: "FORBIDDEN_ROLE" });
    }
  };
}
