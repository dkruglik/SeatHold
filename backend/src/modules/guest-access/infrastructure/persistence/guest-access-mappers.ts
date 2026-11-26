import type { GuestAccessLink as LinkRow, GuestSession as SessionRow } from "../../../../generated/prisma/client.js";
import { GuestAccessLink } from "../../domain/guest-access-link.js";
import { GuestSession } from "../../domain/guest-session.js";

export function toGuestAccessLink(row: LinkRow): GuestAccessLink {
  return new GuestAccessLink(row.id, row.bookingId, row.expiresAt, row.createdAt);
}

export function toGuestSession(row: SessionRow): GuestSession {
  return new GuestSession(row.id, row.bookingId, row.expiresAt, row.createdAt);
}
