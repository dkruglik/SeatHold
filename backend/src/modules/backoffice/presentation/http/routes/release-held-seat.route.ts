import type { FastifyPluginAsync } from "fastify";
import { AuthenticationError } from "../../../../../shared/errors/app-error.js";
import type { BackofficeServices } from "../../../backoffice-composition.js";
import { releaseBodySchema, releaseParamsSchema, releasedSchema } from "../release-dto.js";

/**
 * POST /admin/events/:eventId/seats/:seatId/release: an operator frees a held seat. Registered inside the admin plugin,
 * which runs CSRF, Origin, authentication and the admin-role check. The acting admin is the session user, never the body.
 */
export const releaseHeldSeatRoute = (services: Pick<BackofficeServices, "releaseHeldSeat">): FastifyPluginAsync => async (app) => {
  app.post<{ Params: { eventId: string; seatId: string }; Body: { reason: string } }>(
    "/events/:eventId/seats/:seatId/release",
    { schema: { params: releaseParamsSchema, body: releaseBodySchema, response: { 200: releasedSchema } } },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      if (request.user === null) throw new AuthenticationError("Authentication required", { publicCode: "UNAUTHENTICATED" });
      const { eventId, seatId } = request.params;
      const released = await services.releaseHeldSeat.execute({ eventId, seatId, adminUserId: request.user.id, reason: request.body.reason });
      // The reason is free text: it is stored, never logged.
      request.log.info({ seatId, eventId, adminUserId: request.user.id }, "seat released by operator");
      return { ...released, released: true };
    },
  );
};
