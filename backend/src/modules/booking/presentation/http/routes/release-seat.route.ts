import type { FastifyPluginAsync } from "fastify";
import { HoldNotFound } from "../../../domain/errors.js";
import { holdSeatParamsSchema } from "../booking-dto.js";
import type { BookingRouteOptions } from "../booking-route-options.js";

/** DELETE /events/:eventId/hold/seats/:seatId: frees a seat of the caller's own hold. Never issues a visitor cookie. */
export const releaseSeatRoute: FastifyPluginAsync<BookingRouteOptions> = async (app, options) => {
  app.delete<{ Params: { eventId: string; seatId: string } }>(
    "/events/:eventId/hold/seats/:seatId",
    { schema: { params: holdSeatParamsSchema }, onRequest: [...options.mutationHooks, ...options.identity.resolve] },
    async (request, reply) => {
      if (request.holder === null) {
        throw new HoldNotFound();
      }
      const { eventId, seatId } = request.params;
      await options.services.releaseSeat.release({ holder: request.holder, eventId, seatId });
      return reply.code(204).send();
    },
  );
};
