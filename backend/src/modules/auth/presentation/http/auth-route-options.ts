import type { onRequestAsyncHookHandler } from "fastify";
import type { AuthServices } from "../../auth-composition.js";
import type { AuthHooks } from "./hooks/require-auth.js";
import type { SessionCookieSettings } from "./session-cookie.js";

/**
 * What every auth route module receives. `mutationHooks` run first on every state-changing route.
 * Phase 1 it-5 fills it with the shared CSRF and Origin hooks; until then it is empty (DECISIONS.md O44).
 */
export interface AuthRouteOptions {
  readonly services: AuthServices;
  readonly hooks: AuthHooks;
  readonly mutationHooks: readonly onRequestAsyncHookHandler[];
  readonly cookie: SessionCookieSettings;
}
