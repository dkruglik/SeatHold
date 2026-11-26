import type { FastifyPluginAsync } from "fastify";
import { requireRole, type AuthHooks } from "../../modules/auth/index.js";
import type { BrowserStateChangeHooks } from "./hooks/browser-state-change-hooks.js";

export interface AdminPluginOptions {
  readonly auth: Pick<AuthHooks, "requireAuth">;
  /** CSRF and Origin checks; the plugin runs them first on every request whose method is not GET, HEAD or OPTIONS. */
  readonly mutationHooks: BrowserStateChangeHooks;
  /** The back-office route modules. Each is registered inside the guarded scope; later phases add theirs here. */
  readonly routes: readonly FastifyPluginAsync[];
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The back-office boundary (DECISIONS.md O49). Register it with the prefix `/api/admin`: every route registered
 * through `routes` inherits `onRequest: [mutation hooks (state-changing methods), requireAuth, requireRole('admin')]`,
 * so a route module cannot forget the check. Do not register admin routes anywhere else.
 */
export const adminPlugin: FastifyPluginAsync<AdminPluginOptions> = async (app, options) => {
  app.addHook("onRequest", async function mutationGuard(request, reply) {
    if (!SAFE_METHODS.has(request.method)) {
      for (const hook of options.mutationHooks) {
        await hook.call(app, request, reply);
      }
    }
  });
  app.addHook("onRequest", options.auth.requireAuth);
  app.addHook("onRequest", requireRole("admin"));
  for (const route of options.routes) {
    await app.register(route);
  }
};
