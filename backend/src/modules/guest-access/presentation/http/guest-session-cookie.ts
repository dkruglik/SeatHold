import type { FastifyReply } from "fastify";

export const GUEST_SESSION_COOKIE = "gsid";

export interface GuestCookieSettings {
  /** Adds the Secure attribute; true in production (config `COOKIE_SECURE`). */
  readonly secure: boolean;
}

/** Path /api keeps it off static assets; Lax keeps it off cross-site POSTs; HttpOnly keeps it from scripts. It lasts until the session expires. */
export function setGuestSessionCookie(reply: FastifyReply, token: string, expiresAt: Date, settings: GuestCookieSettings): void {
  void reply.setCookie(GUEST_SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/api", secure: settings.secure, expires: expiresAt });
}
