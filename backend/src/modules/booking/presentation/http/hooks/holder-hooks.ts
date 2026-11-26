import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from "fastify";
import { resolveHolder, type Holder } from "../../../domain/holder.js";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_SECONDS, generateVisitorToken, hashVisitorToken, isVisitorToken } from "./visitor-token.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Who is booking: the signed-in user, else the visitor of the `vid` cookie; null when there is neither. */
    holder: Holder | null;
  }
}

export interface VisitorCookieSettings {
  /** Adds the Secure attribute; true in production (config `COOKIE_SECURE`). */
  readonly secure: boolean;
}

/** What the identity hooks need from the application: the adoption of plan flow 9. */
export interface VisitorHoldAdoption {
  adopt(input: { userId: string; visitorHash: string }): Promise<void>;
}

export interface HolderHooks {
  /** Sets `request.holder` from the user or an existing valid `vid` cookie. Never sets a cookie; for read-only routes. */
  readonly resolveHolder: onRequestAsyncHookHandler;
  /** Like `resolveHolder`, and issues a `vid` cookie to a browser that has no user and no valid cookie, so `request.holder` is never null. */
  readonly issueHolder: onRequestAsyncHookHandler;
}

const existingToken = (request: FastifyRequest): string | undefined => {
  const value = request.cookies[VISITOR_COOKIE];
  return isVisitorToken(value) ? value : undefined;
};

// Path /api keeps it off static assets; Lax keeps it off cross-site POSTs; HttpOnly keeps it from scripts.
const cookieAttributes = (settings: VisitorCookieSettings) => ({ httpOnly: true, sameSite: "lax", path: "/api", secure: settings.secure }) as const;

function issueCookie(reply: FastifyReply, token: string, settings: VisitorCookieSettings): void {
  void reply.setCookie(VISITOR_COOKIE, token, { ...cookieAttributes(settings), maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS });
}

/**
 * Holder identity hooks. They run after the auth module's `optionalAuth` (which sets `request.user`) and need the
 * cookie parser from `registerCsrfProtection`. A signed-in user wins over a visitor cookie.
 */
export function createHolderHooks(settings: VisitorCookieSettings, adoption: VisitorHoldAdoption): HolderHooks {
  /** A session plus a `vid` cookie: the user adopts the visitor's holds, then the browser forgets the cookie. */
  const adoptVisitorHolds = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = existingToken(request);
    if (request.user === null || request.user === undefined || token === undefined) return;
    await adoption.adopt({ userId: request.user.id, visitorHash: hashVisitorToken(token) });
    void reply.clearCookie(VISITOR_COOKIE, cookieAttributes(settings));
  };
  const resolve = (request: FastifyRequest): Holder | null => {
    const token = existingToken(request);
    return resolveHolder({ userId: request.user?.id, visitorHash: token === undefined ? undefined : hashVisitorToken(token) }) ?? null;
  };
  return {
    resolveHolder: async (request, reply) => {
      await adoptVisitorHolds(request, reply);
      request.holder = resolve(request);
    },
    issueHolder: async (request, reply) => {
      await adoptVisitorHolds(request, reply);
      request.holder = resolve(request);
      if (request.holder === null) {
        const token = generateVisitorToken();
        issueCookie(reply, token, settings);
        request.holder = { kind: "visitor", visitorHash: hashVisitorToken(token) };
      }
    },
  };
}
