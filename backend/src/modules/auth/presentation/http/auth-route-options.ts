import type { BrowserStateChangeHooks } from "../../../../presentation/http/hooks/browser-state-change-hooks.js";
import type { AuthServices } from "../../auth-composition.js";
import type { AuthHooks } from "./hooks/require-auth.js";
import type { SessionCookieSettings } from "./session-cookie.js";

/**
 * What every auth route module receives. `mutationHooks` (Origin, then CSRF) run first on every state-changing route.
 * The type needs at least one hook and `buildApp` always supplies the shared list (DECISIONS.md O44, O46, O47, O48).
 */
export interface AuthRouteOptions {
  readonly services: AuthServices;
  readonly hooks: AuthHooks;
  readonly mutationHooks: BrowserStateChangeHooks;
  readonly cookie: SessionCookieSettings;
}
