import type { FastifyPluginAsync } from "fastify";
import { eventDetailParamsSchema, eventDetailSchema, toEventDetailDto } from "../catalog-dto.js";
import type { CatalogRouteOptions } from "../catalog-route-options.js";

/** GET /events/:eventId: public event detail. Reads no cookie and sets none; the answer is the same for every viewer. */
export const eventDetailRoute: FastifyPluginAsync<CatalogRouteOptions> = async (app, options) => {
  app.get<{ Params: { eventId: string } }>(
    "/events/:eventId",
    { schema: { params: eventDetailParamsSchema, response: { 200: eventDetailSchema } } },
    async (request, reply) => {
      const event = await options.services.getEvent.execute(request.params.eventId);
      return reply.header("cache-control", "public, max-age=1").send(toEventDetailDto(event));
    },
  );
};
