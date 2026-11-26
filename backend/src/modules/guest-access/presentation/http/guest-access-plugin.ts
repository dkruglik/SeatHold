import type { FastifyPluginAsync } from "fastify";
import type { BrowserStateChangeHooks } from "../../../../presentation/http/hooks/browser-state-change-hooks.js";
import type { GuestAccessServices } from "../../guest-access-composition.js";
import type { GuestRouteOptions } from "./guest-route-options.js";
import type { GuestCookieSettings } from "./guest-session-cookie.js";
import { createRequireGuestSession } from "./hooks/require-guest-session.js";
import { exchangeRoute } from "./routes/exchange.route.js";
import { guestBookingRoute } from "./routes/guest-booking.route.js";
import { resendRoute } from "./routes/resend.route.js";

export interface GuestAccessPluginOptions {
  readonly services: GuestAccessServices;
  /** CSRF and Origin checks that run first on every state-changing guest route. Required: a route cannot forget them. */
  readonly mutationHooks: BrowserStateChangeHooks;
  readonly cookie: GuestCookieSettings;
}

/**
 * The /guest routes. Register it under the `/api` prefix, on an app where `registerCsrfProtection` has run (it also
 * registers the cookie parser the `gsid` cookie needs). The guest session is a separate credential from the user `sid`.
 */
export const guestAccessPlugin: FastifyPluginAsync<GuestAccessPluginOptions> = async (app, options) => {
  app.decorateRequest("guestSession", null);
  const routeOptions: GuestRouteOptions = {
    services: options.services,
    mutationHooks: options.mutationHooks,
    requireGuestSession: createRequireGuestSession(options.services.getBooking),
    cookie: options.cookie,
  };
  await app.register(
    async (guest) => {
      await guest.register(exchangeRoute, routeOptions);
      await guest.register(guestBookingRoute, routeOptions);
      await guest.register(resendRoute, routeOptions);
    },
    { prefix: "/guest" },
  );
};
