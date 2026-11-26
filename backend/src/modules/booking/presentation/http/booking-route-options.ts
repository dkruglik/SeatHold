import type { onRequestAsyncHookHandler } from "fastify";
import type { BrowserStateChangeHooks } from "../../../../presentation/http/hooks/browser-state-change-hooks.js";
import type { BookingServices } from "../../booking-composition.js";

/**
 * What every booking route module receives. `mutationHooks` (Origin, then CSRF) run first on every state-changing route
 * (the hold, release and checkout routes of later steps); `holder` hooks come after the auth module's `optionalAuth`.
 */
export interface BookingRouteOptions {
  readonly services: BookingServices;
  readonly mutationHooks: BrowserStateChangeHooks;
  /** `optionalAuth` of the auth module, then a holder hook, in that order. */
  readonly identity: {
    readonly resolve: readonly [onRequestAsyncHookHandler, onRequestAsyncHookHandler];
    readonly issue: readonly [onRequestAsyncHookHandler, onRequestAsyncHookHandler];
  };
}
