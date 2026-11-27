import type { FastifyPluginAsync } from "fastify";
import { meSchema, toMeDto } from "../auth-dto.js";
import type { AuthRouteOptions } from "../auth-route-options.js";

/** GET /auth/me: the signed-in user, or `{ user: null }` for an anonymous browser. Per user, so never cached or shared. */
export const meRoute: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.get(
    "/me",
    {
      schema: { response: { 200: { type: "object", properties: { user: { anyOf: [meSchema, { type: "null" }] } }, required: ["user"] } } },
      onRequest: [options.hooks.optionalAuth],
    },
    (request, reply) => {
      void reply.header("cache-control", "no-store").header("vary", "Cookie");
      return { user: request.user === null ? null : toMeDto(request.user) };
    },
  );
};
