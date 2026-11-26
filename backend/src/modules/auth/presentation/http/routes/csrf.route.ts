import type { FastifyPluginAsync } from "fastify";

/**
 * GET /auth/csrf: issues the CSRF token the browser sends back as `X-CSRF-Token` on every mutation.
 * `generateCsrf` also sets the signed secret cookie (or keeps the one the browser sent). Public, so it needs no check itself.
 */
export const csrfRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/csrf",
    { schema: { response: { 200: { type: "object", properties: { csrfToken: { type: "string" } }, required: ["csrfToken"] } } } },
    (_request, reply) => {
      void reply.header("Cache-Control", "no-store");
      return { csrfToken: reply.generateCsrf() };
    },
  );
};
