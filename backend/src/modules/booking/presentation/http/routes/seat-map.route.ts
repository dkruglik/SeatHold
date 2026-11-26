import type { FastifyPluginAsync } from "fastify";
import { eventParamsSchema, seatMapSchema, toSeatMapDto } from "../booking-dto.js";
import type { BookingRouteOptions } from "../booking-route-options.js";

/** GET /events/:eventId/seats: the public seat map. Identical for every viewer, so it reads no cookie and sets none. */
export const seatMapRoute: FastifyPluginAsync<BookingRouteOptions> = async (app, options) => {
  app.get<{ Params: { eventId: string } }>(
    "/events/:eventId/seats",
    { schema: { params: eventParamsSchema, response: { 200: seatMapSchema } } },
    async (request, reply) => {
      const map = await options.services.getSeatMap.execute({ eventId: request.params.eventId });
      return reply.header("cache-control", "public, max-age=1").send(toSeatMapDto(map));
    },
  );
};
