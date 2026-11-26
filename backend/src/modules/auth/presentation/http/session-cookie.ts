import type { FastifyReply } from "fastify";

export const SESSION_COOKIE = "sid";

export interface SessionCookieSettings {
  /** Adds the Secure attribute; true in production (config `COOKIE_SECURE`). */
  readonly secure: boolean;
  readonly maxAgeSeconds: number;
}

// Path /api keeps the cookie off static assets; Lax keeps it off cross-site POSTs; HttpOnly keeps it from scripts.
const attributes = (settings: SessionCookieSettings) => ({ httpOnly: true, sameSite: "lax", path: "/api", secure: settings.secure }) as const;

export function setSessionCookie(reply: FastifyReply, token: string, settings: SessionCookieSettings): void {
  void reply.setCookie(SESSION_COOKIE, token, { ...attributes(settings), maxAge: settings.maxAgeSeconds });
}

export function clearSessionCookie(reply: FastifyReply, settings: SessionCookieSettings): void {
  void reply.clearCookie(SESSION_COOKIE, attributes(settings));
}
