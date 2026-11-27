import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach } from "vitest";
import { buildApp } from "../../../../app.js";
import type { AppConfig } from "../../../../config/load-config.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { createBookingWithGuestAccess, type BookingWithGuestAccess } from "../../../../booking-with-guest-access.js";
import { RecordingEmailProvider } from "../../../auth/application/in-memory-auth-test-support.js";
import { createAuthServices, createPrismaAuthRepositories, type AuthServices } from "../../../auth/index.js";
import { ConsoleEmailProvider } from "../../../auth/infrastructure/email/console-email-provider.js";
import { fetchCsrf } from "../../../auth/presentation/http/auth-memory-app-test-support.js";
import { testConfig } from "../../../auth/presentation/http/auth-route-test-support.js";
import { T0, useGuestAccessDatabase } from "../../infrastructure/persistence/guest-access-test-support.js";

export const EVENT_STARTS_AT = new Date("2026-02-01T12:00:00Z");
export const MS_PER_DAY = 86_400_000;

export interface SeededBooking {
  readonly bookingId: string;
  readonly email: string;
  readonly ticketCode: string;
}

/** A confirmed guest booking with one ticket, written by SQL (the booking module owns that write path in production). */
export async function seedGuestBooking(prisma: PrismaService, email = `g-${randomUUID()}@example.com`): Promise<SeededBooking> {
  const [venue] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO venues (name, city, country_code, timezone) VALUES (${`Hall ${randomUUID()}`}, 'Berlin', 'DE', 'Europe/Berlin') RETURNING id`;
  const [show] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO shows (title, type, genre, description) VALUES ('Show', 'concert', 'rock', 'd') RETURNING id`;
  const [event] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO events (show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
    VALUES (${show?.id}::uuid, ${venue?.id}::uuid, ${EVENT_STARTS_AT}, 5000, 'EUR', 1, 1) RETURNING id`;
  const [seat] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO seats (event_id, row_label, seat_number, status) VALUES (${event?.id}::uuid, 'A', 1, 'sold') RETURNING id`;
  const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO holds (event_id, visitor_hash, expires_at, status, created_at) VALUES (${event?.id}::uuid, 'v', ${T0}, 'converted', ${T0}) RETURNING id`;
  const [booking] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO bookings (hold_id, event_id, guest_email, status, unit_price_minor, total_minor, currency, created_at)
    VALUES (${hold?.id}::uuid, ${event?.id}::uuid, ${email}, 'confirmed', 5000, 5000, 'EUR', ${T0}) RETURNING id`;
  const ticketCode = `TICKET-${randomUUID()}`;
  await prisma.client.$executeRaw`INSERT INTO tickets (booking_id, seat_id, code, created_at) VALUES (${booking?.id}::uuid, ${seat?.id}::uuid, ${ticketCode}, ${T0})`;
  return { bookingId: booking?.id ?? "", email, ticketCode };
}

export interface GuestHarness {
  readonly prisma: PrismaService;
  readonly clock: ControlledClock;
  readonly emails: RecordingEmailProvider;
  readonly logs: () => string;
  readonly app: () => FastifyInstance;
  readonly auth: () => AuthServices;
  readonly guest: () => BookingWithGuestAccess["guestAccess"];
  readonly get: (url: string, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
  /** A browser-like POST: CSRF token with its cookie and the frontend Origin. Passed headers win; `cookie` values are merged. */
  readonly post: (url: string, payload?: object, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
  /** Seeds a booking, emails it a guest link and returns the raw token read from that email. */
  readonly bookingWithLink: (email?: string) => Promise<SeededBooking & { token: string }>;
  /** Exchanges the token and returns the `cookie` header that carries the `gsid` session. */
  readonly sessionFor: (token: string) => Promise<string>;
}

export const tokenFromEmail = (emails: RecordingEmailProvider): string => /#t=([\w-]+)/.exec(emails.sent.at(-1)?.text ?? "")?.[1] ?? "";

/** The real app over Prisma repositories on the throwaway database: auth, booking and guest access, a controlled clock, captured logs. */
export function useGuestApp(configOverrides: Partial<AppConfig> = {}): GuestHarness {
  const prisma = useGuestAccessDatabase();
  const clock = new ControlledClock(T0);
  const emails = new RecordingEmailProvider();
  const lines: string[] = [];
  const logStream = new Writable({ write: (chunk: Buffer, _e, done) => { lines.push(chunk.toString()); done(); } });
  let current: FastifyInstance | undefined;
  let authServices: AuthServices | undefined;
  let wired: BookingWithGuestAccess | undefined;

  beforeEach(async () => {
    clock.set(T0);
    emails.sent.length = 0;
    lines.length = 0;
    const config = testConfig({ logLevel: "info", ...configOverrides });
    authServices = createAuthServices(config, { clock, email: new ConsoleEmailProvider(() => undefined), ...createPrismaAuthRepositories(prisma) });
    wired = createBookingWithGuestAccess(config, { prisma, clock, email: emails, logger: { warn: () => undefined } });
    current = buildApp(config, { clock, logStream, auth: { services: authServices }, booking: { services: wired.booking }, guestAccess: { services: wired.guestAccess } });
    await current.ready();
  });
  afterEach(() => current?.close());

  const app = (): FastifyInstance => {
    if (current === undefined) throw new Error("app is built in beforeEach");
    return current;
  };
  const get: GuestHarness["get"] = (url, headers) => app().inject({ method: "GET", url, ...(headers === undefined ? {} : { headers }) });
  const post: GuestHarness["post"] = async (url, payload, headers) => {
    const csrf = await fetchCsrf(app());
    const cookie = [csrf.cookie, headers?.cookie].filter((value) => value !== undefined).join("; ");
    return app().inject({ method: "POST", url, headers: { origin: testConfig().frontendOrigin, "x-csrf-token": csrf.token, ...headers, cookie }, ...(payload === undefined ? {} : { payload }) });
  };
  const guest = (): BookingWithGuestAccess["guestAccess"] => (wired as BookingWithGuestAccess).guestAccess;
  const bookingWithLink: GuestHarness["bookingWithLink"] = async (email) => {
    const seeded = await seedGuestBooking(prisma, email);
    await guest().issue.issue({ bookingId: seeded.bookingId, email: seeded.email, eventStartsAt: EVENT_STARTS_AT, eventTitle: "Show" });
    return { ...seeded, token: tokenFromEmail(emails) };
  };
  const sessionFor: GuestHarness["sessionFor"] = async (token) => {
    const response = await post("/api/guest/exchange", { token });
    return `gsid=${response.cookies.find((c) => c.name === "gsid")?.value ?? ""}`;
  };
  return { prisma, clock, emails, logs: () => lines.join(""), app, auth: () => authServices as AuthServices, guest, get, post, bookingWithLink, sessionFor };
}
