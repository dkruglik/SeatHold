import cookie from "@fastify/cookie";
import csrfProtection from "@fastify/csrf-protection";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../../config/load-config.js";

/** The cookie that holds the signed CSRF secret. It is not the session cookie (`sid`). */
export const CSRF_COOKIE = "csrf_secret";
export const CSRF_HEADER = "x-csrf-token";

/**
 * Registers cookie parsing and `@fastify/csrf-protection` on the root instance, so `reply.generateCsrf()` and
 * `app.csrfProtection` exist for every route module (DECISIONS.md O46). Double submit: the secret lives in a cookie
 * signed with `CSRF_SECRET`; the token derived from it travels in the `X-CSRF-Token` header. The token is read from
 * that header only, never from the body or other header names. Hooks that enforce it are `browserStateChangeHooks`.
 */
export function registerCsrfProtection(app: FastifyInstance, config: Pick<AppConfig, "csrfSecret" | "cookieSecure">): void {
  void app.register(cookie, { secret: config.csrfSecret });
  void app.register(csrfProtection, {
    sessionPlugin: "@fastify/cookie",
    cookieKey: CSRF_COOKIE,
    cookieOpts: { signed: true, httpOnly: true, sameSite: "lax", path: "/api", secure: config.cookieSecure },
    getToken: (request) => {
      const value = request.headers[CSRF_HEADER];
      return typeof value === "string" ? value : undefined;
    },
  });
}
