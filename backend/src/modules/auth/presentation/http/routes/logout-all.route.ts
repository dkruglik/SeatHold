import type { FastifyPluginAsync } from "fastify";
import type { AuthRouteOptions } from "../auth-route-options.js";
import { clearSessionCookie } from "../session-cookie.js";

/** POST /auth/logout-all: revokes every session of the signed-in user and clears the cookie. */
export const logoutAllRoute: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.post("/logout-all", { onRequest: [...options.mutationHooks, options.hooks.requireAuth] }, async (request, reply) => {
    await options.services.sessions.revokeAll(request.user?.id ?? "");
    clearSessionCookie(reply, options.cookie);
    return reply.code(204).send();
  });
};
