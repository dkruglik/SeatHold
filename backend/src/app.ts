import type { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/load-config.js";
import { buildLoggerOptions } from "./infrastructure/logging/logger-options.js";
import { registerErrorHandler } from "./presentation/http/hooks/error-handler.js";
import { healthRoute } from "./presentation/http/routes/health.route.js";
import type { Clock } from "./shared/time/clock.js";

export interface AppDeps {
  readonly clock: Clock;
  /** Where log lines go; stdout when omitted. Tests pass a capturing stream. */
  readonly logStream?: Writable;
}

/**
 * Builds the HTTP app: every route lives under /api, and no CORS plugin is registered because the
 * frontend and the API share one origin (DECISIONS.md O5).
 */
export function buildApp(config: AppConfig, deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: buildLoggerOptions(config, deps.logStream) });
  registerErrorHandler(app);
  void app.register(healthRoute, { prefix: "/api" });
  return app;
}
