import type { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/load-config.js";
import { buildLoggerOptions } from "./infrastructure/logging/logger-options.js";
import { registerCsrfProtection } from "./presentation/http/csrf-protection.js";
import { browserStateChangeHooks } from "./presentation/http/hooks/browser-state-change-hooks.js";
import { adminPlugin } from "./presentation/http/admin-plugin.js";
import { registerErrorHandler } from "./presentation/http/hooks/error-handler.js";
import { healthRoute } from "./presentation/http/routes/health.route.js";
import { authPlugin, createAuthHooks, type AuthPluginOptions } from "./modules/auth/index.js";
import { catalogPlugin, type CatalogPluginOptions } from "./modules/catalog/index.js";
import { bookingPlugin, type BookingPluginOptions } from "./modules/booking/index.js";
import { backofficeRoutes, type BackofficeServices } from "./modules/backoffice/index.js";
import { guestAccessPlugin, type GuestAccessPluginOptions } from "./modules/guest-access/index.js";
import type { Clock } from "./shared/time/clock.js";

const SECONDS_PER_DAY = 86_400;

export interface AppDeps {
  readonly clock: Clock;
  /** Where log lines go; stdout when omitted. Tests pass a capturing stream. */
  readonly logStream?: Writable;
  /** The auth module's services; routes under /api/auth exist only when given. */
  readonly auth?: Pick<AuthPluginOptions, "services">;
  /** The booking module's services; routes under /api/events exist only when given, and they need `auth` for the session lookup. */
  readonly booking?: Pick<BookingPluginOptions, "services">;
  /** The catalog module's services; the public /api/shows routes exist only when given. They need no auth. */
  readonly catalog?: Pick<CatalogPluginOptions, "services">;
  /** The guest-access module's services; the /api/guest routes exist only when given. They need no auth: the guest session is its own credential. */
  readonly guestAccess?: Pick<GuestAccessPluginOptions, "services">;
  /** The back-office services; their routes join the admin plugin, so they exist only with `auth` and are admin-only by construction. */
  readonly backoffice?: { readonly services: BackofficeServices };
}

/**
 * Builds the HTTP app: every route lives under /api, and no CORS plugin is registered because the
 * frontend and the API share one origin (DECISIONS.md O5).
 */
export function buildApp(config: AppConfig, deps: AppDeps): FastifyInstance {
  if (deps.booking !== undefined && deps.auth === undefined) {
    throw new Error("buildApp: booking routes need the auth services for the session lookup; pass deps.auth with deps.booking");
  }
  if (deps.backoffice !== undefined && deps.auth === undefined) {
    throw new Error("buildApp: back-office routes need the auth services for the admin guard; pass deps.auth with deps.backoffice");
  }
  const app = Fastify({ logger: buildLoggerOptions(config, deps.logStream) });
  registerErrorHandler(app);
  registerCsrfProtection(app, config);
  void app.register(healthRoute, { prefix: "/api" });
  if (deps.catalog !== undefined) {
    void app.register(catalogPlugin, { prefix: "/api", ...deps.catalog });
  }
  if (deps.auth !== undefined) {
    const mutationHooks = browserStateChangeHooks(config);
    void app.register(authPlugin, {
      prefix: "/api",
      ...deps.auth,
      mutationHooks,
      cookie: { secure: config.cookieSecure, maxAgeSeconds: config.sessionTtlDays * SECONDS_PER_DAY },
    });
    void app.register(adminPlugin, {
      prefix: "/api/admin",
      auth: createAuthHooks(deps.auth.services.sessions),
      mutationHooks,
      routes: deps.backoffice === undefined ? [] : backofficeRoutes(deps.backoffice.services),
    });
  }
  if (deps.booking !== undefined && deps.auth !== undefined) {
    void app.register(bookingPlugin, {
      prefix: "/api",
      ...deps.booking,
      mutationHooks: browserStateChangeHooks(config),
      auth: createAuthHooks(deps.auth.services.sessions),
      cookie: { secure: config.cookieSecure },
    });
  }
  if (deps.guestAccess !== undefined) {
    void app.register(guestAccessPlugin, {
      prefix: "/api",
      ...deps.guestAccess,
      mutationHooks: browserStateChangeHooks(config),
      cookie: { secure: config.cookieSecure },
    });
  }
  return app;
}
