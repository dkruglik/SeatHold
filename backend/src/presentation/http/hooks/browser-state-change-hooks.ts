import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from "fastify";
import type { AppConfig } from "../../../config/load-config.js";
import { AuthorizationError } from "../../../shared/errors/app-error.js";

/** At least one hook, so a route module cannot be handed an empty list by mistake. */
export type BrowserStateChangeHooks = readonly [onRequestAsyncHookHandler, ...onRequestAsyncHookHandler[]];

/** Origin must equal the configured frontend origin exactly. A missing header is a failure: browsers send Origin on every mutation. */
function originHook(allowedOrigin: string): onRequestAsyncHookHandler {
  return async (request) => {
    if (request.headers.origin !== allowedOrigin) {
      throw new AuthorizationError("Request origin is not allowed", { publicCode: "ORIGIN_INVALID" });
    }
  };
}

/**
 * Runs the library's check and turns its failure into our error contract. The library answers through `reply.send`
 * with its own error; the adapter hands it a reply that rejects instead, so the shared error handler formats it.
 */
const csrfHook: onRequestAsyncHookHandler = (request: FastifyRequest, reply: FastifyReply) =>
  new Promise<void>((resolve, reject) => {
    const rejecting = {
      unsignCookie: (value: string) => reply.unsignCookie(value),
      send: () => reject(new AuthorizationError("CSRF token missing or invalid", { publicCode: "CSRF_INVALID" })),
    } as unknown as FastifyReply;
    request.server.csrfProtection(request, rejecting, resolve);
  });

/**
 * The CSRF and Origin checks every state-changing browser route composes (rules 42 and 81), Origin first.
 * Not registered globally: route modules put the list in `onRequest`. Needs `registerCsrfProtection` on the app.
 */
export function browserStateChangeHooks(config: Pick<AppConfig, "frontendOrigin">): BrowserStateChangeHooks {
  return [originHook(config.frontendOrigin), csrfHook];
}
