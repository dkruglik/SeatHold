import type { FastifyPluginAsync } from "fastify";
import type { AuthRouteOptions } from "../auth-route-options.js";

const bodySchema = {
  type: "object",
  properties: { email: { type: "string", minLength: 1, maxLength: 254 } },
  required: ["email"],
  additionalProperties: false,
} as const;

/** POST /auth/request-code: 204 for any well-formed email, known or not; 429 over the limit, again for any email. */
export const requestCodeRoute: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  app.post<{ Body: { email: string } }>(
    "/request-code",
    { schema: { body: bodySchema }, onRequest: [...options.mutationHooks] },
    async (request, reply) => {
      const result = await options.services.requestCode.execute({ email: request.body.email });
      if (result.kind === "rate_limited") {
        return reply
          .code(429)
          .header("Retry-After", String(result.retryAfterSeconds))
          .send({
            error: { code: "RATE_LIMITED", message: "Too many code requests. Try again later." },
            retryAfterSeconds: result.retryAfterSeconds,
          });
      }
      return reply.code(204).send();
    },
  );
};
