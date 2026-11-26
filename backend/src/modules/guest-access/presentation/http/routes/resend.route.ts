import type { FastifyPluginAsync } from "fastify";
import { resendBodySchema } from "../guest-booking-dto.js";
import type { GuestRouteOptions } from "../guest-route-options.js";

/** POST /guest/resend: 204 for any well-formed email, known or not; 429 over the limit, again for any email. */
export const resendRoute: FastifyPluginAsync<GuestRouteOptions> = async (app, options) => {
  app.post<{ Body: { email: string } }>(
    "/resend",
    { schema: { body: resendBodySchema }, onRequest: [...options.mutationHooks] },
    async (request, reply) => {
      const result = await options.services.resend.resend({ email: request.body.email });
      if (result.kind === "rate_limited") {
        return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } });
      }
      return reply.code(204).send();
    },
  );
};
