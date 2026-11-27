import type { FastifyPluginAsync } from "fastify";
import type { BackofficeServices } from "../../../backoffice-composition.js";
import { eventIdParamsSchema, openTicketsSchema, pageQuerySchema, toOpenTicketsDto, type PageQuery } from "../admin-read-dto.js";

/** GET /admin/events/:eventId/open-tickets: seats still open to buyers. Registered inside the admin plugin, which guards it. */
export const openTicketsRoute = (services: Pick<BackofficeServices, "listOpenTickets">): FastifyPluginAsync => async (app) => {
  app.get<{ Params: { eventId: string }; Querystring: PageQuery }>(
    "/events/:eventId/open-tickets",
    { schema: { params: eventIdParamsSchema, querystring: pageQuerySchema(50), response: { 200: openTicketsSchema } } },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      return toOpenTicketsDto(await services.listOpenTickets.execute({ eventId: request.params.eventId, ...request.query }));
    },
  );
};
