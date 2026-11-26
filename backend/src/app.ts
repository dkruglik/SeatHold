import type { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/load-config.js";
import { buildLoggerOptions } from "./infrastructure/logging/logger-options.js";
import { registerCsrfProtection } from "./presentation/http/csrf-protection.js";
import { browserStateChangeHooks } from "./presentation/http/hooks/browser-state-change-hooks.js";
import { registerErrorHandler } from "./presentation/http/hooks/error-handler.js";
import { healthRoute } from "./presentation/http/routes/health.route.js";
import { authPlugin, type AuthPluginOptions } from "./modules/auth/index.js";
import type { Clock } from "./shared/time/clock.js";

const SECONDS_PER_DAY = 86_400;

export interface AppDeps {
  readonly clock: Clock;
  /** Where log lines go; stdout when omitted. Tests pass a capturing stream. */
  readonly logStream?: Writable;
  /** The auth module's services; routes under /api/auth exist only when given. */
  readonly auth?: Pick<AuthPluginOptions, "services">;
}

/**
 * Builds the HTTP app: every route lives under /api, and no CORS plugin is registered because the
 * frontend and the API share one origin (DECISIONS.md O5).
 */
export function buildApp(config: AppConfig, deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: buildLoggerOptions(config, deps.logStream) });
  registerErrorHandler(app);
  registerCsrfProtection(app, config);
  void app.register(healthRoute, { prefix: "/api" });
  if (deps.auth !== undefined) {
    void app.register(authPlugin, {
      prefix: "/api",
      ...deps.auth,
      mutationHooks: browserStateChangeHooks(config),
      cookie: { secure: config.cookieSecure, maxAgeSeconds: config.sessionTtlDays * SECONDS_PER_DAY },
    });
  }
  return app;
}
