import type { FastifyPluginAsync } from "fastify";
import type { BrowserStateChangeHooks } from "../../../../presentation/http/hooks/browser-state-change-hooks.js";
import type { AuthServices } from "../../auth-composition.js";
import type { AuthRouteOptions } from "./auth-route-options.js";
import { createAuthHooks } from "./hooks/require-auth.js";
import { csrfRoute } from "./routes/csrf.route.js";
import { logoutAllRoute } from "./routes/logout-all.route.js";
import { logoutRoute } from "./routes/logout.route.js";
import { meRoute } from "./routes/me.route.js";
import { requestCodeRoute } from "./routes/request-code.route.js";
import { verifyRoute } from "./routes/verify.route.js";
import type { SessionCookieSettings } from "./session-cookie.js";

export interface AuthPluginOptions {
  readonly services: AuthServices;
  readonly cookie: SessionCookieSettings;
  /** CSRF and Origin checks that run first on every state-changing auth route. Required: a route cannot forget them. */
  readonly mutationHooks: BrowserStateChangeHooks;
}

/**
 * The /auth routes of the auth module. Register it under the `/api` prefix, on an app where `registerCsrfProtection`
 * has run (it also registers the cookie parser the session cookie needs).
 */
export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);
  const routeOptions: AuthRouteOptions = {
    services: options.services,
    hooks: createAuthHooks(options.services.sessions),
    mutationHooks: options.mutationHooks,
    cookie: options.cookie,
  };
  await app.register(
    async (auth) => {
      await auth.register(csrfRoute);
      await auth.register(requestCodeRoute, routeOptions);
      await auth.register(verifyRoute, routeOptions);
      await auth.register(meRoute, routeOptions);
      await auth.register(logoutRoute, routeOptions);
      await auth.register(logoutAllRoute, routeOptions);
    },
    { prefix: "/auth" },
  );
};
