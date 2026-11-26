import type { FastifyPluginAsync } from "fastify";
import { exchangeBodySchema, guestBookingSchema, toGuestBookingDto } from "../guest-booking-dto.js";
import type { GuestRouteOptions } from "../guest-route-options.js";
import { setGuestSessionCookie } from "../guest-session-cookie.js";

/** POST /guest/exchange: consumes the emailed link once, sets the guest session cookie and returns the booking. 410 LINK_* otherwise. */
export const exchangeRoute: FastifyPluginAsync<GuestRouteOptions> = async (app, options) => {
  app.post<{ Body: { token: string } }>(
    "/exchange",
    { schema: { body: exchangeBodySchema, response: { 200: guestBookingSchema } }, onRequest: [...options.mutationHooks] },
    async (request, reply) => {
      const session = await options.services.exchange.exchange({ token: request.body.token });
      const booking = await options.services.getBooking.get({ sessionToken: session.sessionToken });
      setGuestSessionCookie(reply, session.sessionToken, session.expiresAt, options.cookie);
      void reply.header("cache-control", "no-store");
      return toGuestBookingDto(booking);
    },
  );
};
