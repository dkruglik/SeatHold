import type { FastifyPluginAsync } from "fastify";
import { AuthenticationError } from "../../../../../shared/errors/app-error.js";
import { myBookingsSchema, toMyBookingsDto } from "../booking-dto.js";
import type { BookingRouteOptions } from "../booking-route-options.js";

/** GET /me/bookings: the signed-in user's confirmed bookings with ticket codes. Per user, so never cached or shared. */
export const myBookingsRoute: FastifyPluginAsync<BookingRouteOptions> = async (app, options) => {
  app.get(
    "/me/bookings",
    { schema: { response: { 200: myBookingsSchema } }, onRequest: [options.requireAuth] },
    async (request, reply) => {
      void reply.header("cache-control", "no-store").header("vary", "Cookie");
      if (request.user === null) throw new AuthenticationError("Authentication required", { publicCode: "UNAUTHENTICATED" }); // requireAuth ran first
      const bookings = await options.services.listMyBookings.execute({ userId: request.user.id });
      return toMyBookingsDto(bookings);
    },
  );
};
