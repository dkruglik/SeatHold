import type { FastifyPluginAsync } from "fastify";
import { currentHoldSchema, holdSeatParamsSchema, toCurrentHoldDto } from "../booking-dto.js";
import type { BookingRouteOptions } from "../booking-route-options.js";

/** PUT /events/:eventId/hold/seats/:seatId: holds one seat for the caller, issuing the visitor cookie when needed. */
export const holdSeatRoute: FastifyPluginAsync<BookingRouteOptions> = async (app, options) => {
  app.put<{ Params: { eventId: string; seatId: string } }>(
    "/events/:eventId/hold/seats/:seatId",
    { schema: { params: holdSeatParamsSchema, response: { 200: currentHoldSchema } }, onRequest: [...options.mutationHooks, ...options.identity.issue] },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      const { eventId, seatId } = request.params;
      const hold = await options.services.holdSeat.hold({ holder: request.holder as NonNullable<typeof request.holder>, eventId, seatId });
      return toCurrentHoldDto(hold);
    },
  );
};
