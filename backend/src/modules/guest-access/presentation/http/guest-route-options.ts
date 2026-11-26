import type { onRequestAsyncHookHandler } from "fastify";
import type { BrowserStateChangeHooks } from "../../../../presentation/http/hooks/browser-state-change-hooks.js";
import type { GuestAccessServices } from "../../guest-access-composition.js";
import type { GuestCookieSettings } from "./guest-session-cookie.js";

export interface GuestRouteOptions {
  readonly services: GuestAccessServices;
  readonly mutationHooks: BrowserStateChangeHooks;
  readonly requireGuestSession: onRequestAsyncHookHandler;
  readonly cookie: GuestCookieSettings;
}
