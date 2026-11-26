import { GuestAccessLink } from "../domain/guest-access-link.js";
import type { GuestLinkState } from "../domain/guest-link-state.js";
import { GuestSession } from "../domain/guest-session.js";
import type { GuestLinkRepository, NewGuestLink } from "./ports/guest-link-repository.js";
import type { GuestResendLimiter } from "./ports/guest-resend-limiter.js";
import type { GuestSessionRepository, NewGuestSession } from "./ports/guest-session-repository.js";
import type { GuestBookings } from "./ports/guest-bookings.js";
import type { EmailMessage, EmailProvider } from "../../auth/index.js";
import type { WarnLogger } from "../../../shared/logging/warn-logger.js";
import { InfrastructureError } from "../../../shared/errors/app-error.js";

export const T0 = new Date("2026-01-01T12:00:00Z");
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const EVENT_START = new Date(T0.getTime() + 10 * DAY);

/** Calls in order across fakes, to prove "limiter before lookup". */
export const trace: string[] = [];

interface StoredLink { id: string; bookingId: string; tokenHash: string; expiresAt: Date; createdAt: Date; consumedAt: Date | null; invalidatedAt: Date | null }

export class InMemoryGuestLinks implements GuestLinkRepository {
  readonly rows: StoredLink[] = [];

  create(link: NewGuestLink): Promise<GuestAccessLink> {
    const row = { id: `l${this.rows.length + 1}`, bookingId: link.bookingId, tokenHash: link.tokenHash, expiresAt: link.expiresAt, createdAt: link.now, consumedAt: null, invalidatedAt: null };
    this.rows.push(row);
    return Promise.resolve(new GuestAccessLink(row.id, row.bookingId, row.expiresAt, row.createdAt));
  }

  consumeByTokenHash(tokenHash: string, now: Date): Promise<string | null> {
    const row = this.rows.find((r) => r.tokenHash === tokenHash && r.consumedAt === null && r.invalidatedAt === null && r.expiresAt > now);
    if (row === undefined) return Promise.resolve(null);
    row.consumedAt = now;
    return Promise.resolve(row.bookingId);
  }

  findStateByTokenHash(tokenHash: string, now: Date): Promise<GuestLinkState> {
    const row = this.rows.find((r) => r.tokenHash === tokenHash);
    if (row === undefined) return Promise.resolve("unknown");
    if (row.consumedAt !== null) return Promise.resolve("used");
    if (row.invalidatedAt !== null) return Promise.resolve("invalidated");
    return Promise.resolve(row.expiresAt <= now ? "expired" : "usable");
  }

  invalidateUnusedForBookings(bookingIds: readonly string[], now: Date): Promise<void> {
    trace.push("links.invalidate");
    for (const r of this.rows) if (bookingIds.includes(r.bookingId) && r.consumedAt === null && r.invalidatedAt === null) r.invalidatedAt = now;
    return Promise.resolve();
  }
}

interface StoredSession { session: GuestSession; tokenHash: string; revokedAt: Date | null }

export class InMemoryGuestSessions implements GuestSessionRepository {
  readonly rows: StoredSession[] = [];

  create(s: NewGuestSession): Promise<GuestSession> {
    const session = new GuestSession(`s${this.rows.length + 1}`, s.bookingId, s.expiresAt, s.now);
    this.rows.push({ session, tokenHash: s.tokenHash, revokedAt: null });
    return Promise.resolve(session);
  }

  findActiveByTokenHash(tokenHash: string, now: Date): Promise<GuestSession | null> {
    const row = this.rows.find((r) => r.tokenHash === tokenHash && r.revokedAt === null && r.session.expiresAt > now);
    return Promise.resolve(row?.session ?? null);
  }

  revokeForBookings(bookingIds: readonly string[], now: Date): Promise<void> {
    trace.push("sessions.revoke");
    for (const r of this.rows) if (bookingIds.includes(r.session.bookingId) && r.revokedAt === null) r.revokedAt = now;
    return Promise.resolve();
  }
}

export class FakeLimiter implements GuestResendLimiter {
  allow = true;
  readonly calls: { emailHash: string; limit: number; windowMinutes: number }[] = [];

  tryRegister(emailHash: string, _now: Date, limit: number, windowMinutes: number): Promise<boolean> {
    trace.push("limiter");
    this.calls.push({ emailHash, limit, windowMinutes });
    return Promise.resolve(this.allow);
  }
}

export class RecordingEmail implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  fail = false;

  send(message: EmailMessage): Promise<void> {
    if (this.fail) return Promise.reject(new InfrastructureError(`smtp refused ${message.to} ${message.text}`));
    this.sent.push(message);
    return Promise.resolve();
  }
}

export class RecordingLogger implements WarnLogger {
  readonly lines: { message: string; fields: Record<string, unknown> | undefined }[] = [];
  warn(message: string, fields?: Record<string, unknown>): void { this.lines.push({ message, fields }); }
  text(): string { return JSON.stringify(this.lines); }
}

export const booking = (bookingId: string, title = "Rock Night") => ({
  bookingId, createdAt: T0, totalMinor: 5000, currency: "EUR",
  event: { eventId: "e1", title, startsAt: EVENT_START, venueName: "Hall", city: "Berlin", timezone: "Europe/Berlin" },
});

export class FakeGuestBookings implements GuestBookings {
  confirmed = new Map<string, ReturnType<typeof booking>>();
  upcoming = new Map<string, ReturnType<typeof booking>[]>();

  findConfirmedGuestBooking(id: string) { return Promise.resolve(this.confirmed.get(id) ?? null); }
  getConfirmedBookingWithTickets(id: string) {
    const b = this.confirmed.get(id);
    return Promise.resolve(b === undefined ? null : { ...b, status: "confirmed" as const, tickets: [{ ticketId: "t1", code: "CODE", rowLabel: "A", seatNumber: 1 }] });
  }
  findUpcomingConfirmedGuestBookingsByEmail(email: string) {
    trace.push("bookings.lookup");
    return Promise.resolve(this.upcoming.get(email) ?? []);
  }
}
