import type { FastifyPluginAsync } from "fastify";
import { HoldNotFound } from "../../../domain/errors.js";
import { bookingSchema, checkoutBodySchema, eventParamsSchema, toBookingDto, type CheckoutBody } from "../booking-dto.js";
import type { BookingRouteOptions } from "../booking-route-options.js";

/** POST /events/:eventId/hold/checkout: pays for the caller's hold. Never creates a visitor or issues a cookie. */
export const checkoutRoute: FastifyPluginAsync<BookingRouteOptions> = async (app, options) => {
  app.post<{ Params: { eventId: string }; Body: CheckoutBody }>(
    "/events/:eventId/hold/checkout",
    { schema: { params: eventParamsSchema, body: checkoutBodySchema, response: { 201: bookingSchema } }, onRequest: [...options.mutationHooks, ...options.identity.resolve] },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      if (request.holder === null) {
        throw new HoldNotFound();
      }
      const { paymentOutcome, guestEmail } = request.body;
      const booking = await options.services.checkout.checkout({ holder: request.holder, eventId: request.params.eventId, paymentOutcome, guestEmail });
      return reply.code(201).send(toBookingDto(booking));
    },
  );
};
