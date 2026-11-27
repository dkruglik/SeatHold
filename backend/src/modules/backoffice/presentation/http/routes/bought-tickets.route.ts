import type { FastifyPluginAsync } from "fastify";
import type { BackofficeServices } from "../../../backoffice-composition.js";
import { boughtTicketsSchema, eventIdParamsSchema, pageQuerySchema, toBoughtTicketsDto, type PageQuery } from "../admin-read-dto.js";

/** GET /admin/events/:eventId/bought-tickets: tickets of confirmed bookings with the buyer's email. Registered inside the admin plugin, which guards it. */
export const boughtTicketsRoute = (services: Pick<BackofficeServices, "listBoughtTickets">): FastifyPluginAsync => async (app) => {
  app.get<{ Params: { eventId: string }; Querystring: PageQuery }>(
    "/events/:eventId/bought-tickets",
    { schema: { params: eventIdParamsSchema, querystring: pageQuerySchema(50), response: { 200: boughtTicketsSchema } } },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      return toBoughtTicketsDto(await services.listBoughtTickets.execute({ eventId: request.params.eventId, ...request.query }));
    },
  );
};
