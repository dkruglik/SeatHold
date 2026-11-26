import type { FastifyPluginAsync } from "fastify";
import { AuthenticationError } from "../../../../../shared/errors/app-error.js";
import { guestBookingSchema, toGuestBookingDto } from "../guest-booking-dto.js";
import type { GuestRouteOptions } from "../guest-route-options.js";

/** GET /guest/booking: the one booking of the guest session, with ticket codes. Per session, so never cached or shared. */
export const guestBookingRoute: FastifyPluginAsync<GuestRouteOptions> = async (app, options) => {
  app.get(
    "/booking",
    { schema: { response: { 200: guestBookingSchema } }, onRequest: [options.requireGuestSession] },
    async (request, reply) => {
      void reply.header("cache-control", "no-store").header("vary", "Cookie");
      if (request.guestSession === null) throw new AuthenticationError("Authentication required", { publicCode: "UNAUTHENTICATED" }); // the hook ran first
      return toGuestBookingDto(request.guestSession.booking);
    },
  );
};
