import type { FastifyPluginAsync } from "fastify";
import { HoldNotFound } from "../../../domain/errors.js";
import { currentHoldSchema, eventParamsSchema, toCurrentHoldDto } from "../booking-dto.js";
import type { BookingRouteOptions } from "../booking-route-options.js";

/** GET /events/:eventId/hold: the caller's live hold. Never cached; never issues a visitor cookie. */
export const currentHoldRoute: FastifyPluginAsync<BookingRouteOptions> = async (app, options) => {
  app.get<{ Params: { eventId: string } }>(
    "/events/:eventId/hold",
    { schema: { params: eventParamsSchema, response: { 200: currentHoldSchema } }, onRequest: [...options.identity.resolve] },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      if (request.holder === null) {
        throw new HoldNotFound();
      }
      const hold = await options.services.getCurrentHold.execute({ holder: request.holder, eventId: request.params.eventId });
      return toCurrentHoldDto(hold);
    },
  );
};
