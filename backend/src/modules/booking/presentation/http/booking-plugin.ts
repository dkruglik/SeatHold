import type { FastifyPluginAsync, onRequestAsyncHookHandler } from "fastify";
import type { BrowserStateChangeHooks } from "../../../../presentation/http/hooks/browser-state-change-hooks.js";
import type { BookingServices } from "../../booking-composition.js";
import type { BookingRouteOptions } from "./booking-route-options.js";
import { createHolderHooks, type VisitorCookieSettings } from "./hooks/holder-hooks.js";
import { checkoutRoute } from "./routes/checkout.route.js";
import { currentHoldRoute } from "./routes/current-hold.route.js";
import { holdSeatRoute } from "./routes/hold-seat.route.js";
import { myBookingsRoute } from "./routes/my-bookings.route.js";
import { releaseSeatRoute } from "./routes/release-seat.route.js";
import { seatMapRoute } from "./routes/seat-map.route.js";

export interface BookingPluginOptions {
  readonly services: BookingServices;
  /** CSRF and Origin checks that run first on every state-changing booking route. Required: a route cannot forget them. */
  readonly mutationHooks: BrowserStateChangeHooks;
  /** The auth module's hooks (from its public `createAuthHooks`): `optionalAuth` sets `request.user` before the holder is resolved; `requireAuth` guards the per-user routes. */
  readonly auth: { readonly optionalAuth: onRequestAsyncHookHandler; readonly requireAuth: onRequestAsyncHookHandler };
  readonly cookie: VisitorCookieSettings;
}

/**
 * The booking routes. Register it under the `/api` prefix, on an app where `registerCsrfProtection` has run
 * (it also registers the cookie parser the `vid` cookie needs).
 */
export const bookingPlugin: FastifyPluginAsync<BookingPluginOptions> = async (app, options) => {
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);
  app.decorateRequest("holder", null);
  const holder = createHolderHooks(options.cookie, options.services.adoptVisitorHolds);
  const routeOptions: BookingRouteOptions = {
    services: options.services,
    mutationHooks: options.mutationHooks,
    requireAuth: options.auth.requireAuth,
    identity: {
      resolve: [options.auth.optionalAuth, holder.resolveHolder],
      issue: [options.auth.optionalAuth, holder.issueHolder],
    },
  };
  await app.register(seatMapRoute, routeOptions);
  await app.register(currentHoldRoute, routeOptions);
  await app.register(holdSeatRoute, routeOptions);
  await app.register(releaseSeatRoute, routeOptions);
  await app.register(checkoutRoute, routeOptions);
  await app.register(myBookingsRoute, routeOptions);
};
