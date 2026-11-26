import type { FastifyRequest, onRequestAsyncHookHandler } from "fastify";
import { AuthenticationError } from "../../../../../shared/errors/app-error.js";
import type { SessionService } from "../../../application/session-service.js";
import type { User } from "../../../domain/user.js";
import { SESSION_COOKIE } from "../session-cookie.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The signed-in user, role read from the database for this request; null when there is no live session. */
    user: User | null;
    /** The id of the session behind `user`; null when there is none. */
    sessionId: string | null;
  }
}

export interface AuthHooks {
  /** Rejects with 401 UNAUTHENTICATED unless the `sid` cookie names a live session; otherwise sets `request.user`. */
  readonly requireAuth: onRequestAsyncHookHandler;
  /** Sets `request.user` when there is a live session and never rejects. */
  readonly optionalAuth: onRequestAsyncHookHandler;
}

/** Hooks that resolve the session cookie through SessionService. Routes compose them; they do not reimplement them. */
export function createAuthHooks(sessions: SessionService): AuthHooks {
  const attach = async (request: FastifyRequest): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE];
    const active = token === undefined || token === "" ? null : await sessions.authenticate(token);
    request.user = active?.user ?? null;
    request.sessionId = active?.id ?? null;
  };
  return {
    optionalAuth: attach,
    requireAuth: async (request) => {
      await attach(request);
      if (request.user === null) {
        throw new AuthenticationError("Authentication required", { publicCode: "UNAUTHENTICATED" });
      }
    },
  };
}
