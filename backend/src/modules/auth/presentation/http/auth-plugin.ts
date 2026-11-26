import cookie from "@fastify/cookie";
import type { FastifyPluginAsync, onRequestAsyncHookHandler } from "fastify";
import type { AuthServices } from "../../auth-composition.js";
import type { AuthRouteOptions } from "./auth-route-options.js";
import { createAuthHooks } from "./hooks/require-auth.js";
import { logoutAllRoute } from "./routes/logout-all.route.js";
import { logoutRoute } from "./routes/logout.route.js";
import { meRoute } from "./routes/me.route.js";
import { requestCodeRoute } from "./routes/request-code.route.js";
import { verifyRoute } from "./routes/verify.route.js";
import type { SessionCookieSettings } from "./session-cookie.js";

export interface AuthPluginOptions {
  readonly services: AuthServices;
  readonly cookie: SessionCookieSettings;
  /** Hooks that run first on every state-changing auth route (CSRF and Origin from it-5). */
  readonly mutationHooks?: readonly onRequestAsyncHookHandler[];
}

/** The /auth routes of the auth module. Register it under the `/api` prefix. */
export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  await app.register(cookie);
  app.decorateRequest("user", null);
  app.decorateRequest("sessionId", null);
  const routeOptions: AuthRouteOptions = {
    services: options.services,
    hooks: createAuthHooks(options.services.sessions),
    mutationHooks: options.mutationHooks ?? [],
    cookie: options.cookie,
  };
  await app.register(
    async (auth) => {
      await auth.register(requestCodeRoute, routeOptions);
      await auth.register(verifyRoute, routeOptions);
      await auth.register(meRoute, routeOptions);
      await auth.register(logoutRoute, routeOptions);
      await auth.register(logoutAllRoute, routeOptions);
    },
    { prefix: "/auth" },
  );
};
