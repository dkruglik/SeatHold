import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { CryptoGuestTokens } from "../infrastructure/crypto/crypto-guest-tokens.js";
import { ExchangeGuestLinkService } from "./exchange-guest-link-service.js";
import { GetGuestBookingQuery } from "./get-guest-booking-query.js";
import { IssueGuestLinkService } from "./issue-guest-link-service.js";
import { ResendGuestLinksService } from "./resend-guest-links-service.js";
import { FakeGuestBookings, FakeLimiter, InMemoryGuestLinks, InMemoryGuestSessions, RecordingEmail, RecordingLogger, T0, trace } from "./in-memory-guest-access.test-support.js";

export const ORIGIN = "https://seats.example.org";

/** Every service wired to in-memory fakes and a controlled clock. */
export function setup() {
  trace.length = 0;
  const clock = new ControlledClock(T0);
  const links = new InMemoryGuestLinks();
  const sessions = new InMemoryGuestSessions();
  const limiter = new FakeLimiter();
  const email = new RecordingEmail();
  const logger = new RecordingLogger();
  const bookings = new FakeGuestBookings();
  const tokens = new CryptoGuestTokens();
  const issue = new IssueGuestLinkService({ clock, links, email, tokens, logger, frontendOrigin: ORIGIN, linkTtlHours: 168 });
  const exchange = new ExchangeGuestLinkService({ clock, links, sessions, tokens, bookings });
  const resend = new ResendGuestLinksService({ clock, links, sessions, limiter, bookings, tokens, issue, limit: 3, windowMinutes: 60 });
  const getBooking = new GetGuestBookingQuery({ clock, sessions, tokens, bookings });
  return { clock, links, sessions, limiter, email, logger, bookings, tokens, issue, exchange, resend, getBooking };
}

/** The token in the emailed link (after `#t=`). */
export const tokenIn = (text: string): string => /#t=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
