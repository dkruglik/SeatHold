import type { FastifyPluginAsync } from "fastify";
import type { AuthRouteOptions } from "../auth-route-options.js";
import { clearSessionCookie } from "../session-cookie.js";

/** POST /auth/logout: revokes the session of this request only and clears its cookie. */
export const logoutRoute: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.post("/logout", { onRequest: [...options.mutationHooks, options.hooks.requireAuth] }, async (request, reply) => {
    await options.services.sessions.revoke(request.sessionId ?? "");
    clearSessionCookie(reply, options.cookie);
    return reply.code(204).send();
  });
};
