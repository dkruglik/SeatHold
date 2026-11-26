import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import type { AppConfig } from "../../config/load-config.js";
import type { WarnLogger } from "../../shared/logging/warn-logger.js";
import type { Clock } from "../../shared/time/clock.js";
import type { EmailProvider } from "../auth/index.js";
import { ExchangeGuestLinkService } from "./application/exchange-guest-link-service.js";
import { GetGuestBookingQuery } from "./application/get-guest-booking-query.js";
import { IssueGuestLinkService } from "./application/issue-guest-link-service.js";
import type { GuestBookings } from "./application/ports/guest-bookings.js";
import type { GuestLinkRepository } from "./application/ports/guest-link-repository.js";
import type { GuestResendLimiter } from "./application/ports/guest-resend-limiter.js";
import type { GuestSessionRepository } from "./application/ports/guest-session-repository.js";
import { ResendGuestLinksService } from "./application/resend-guest-links-service.js";
import { CryptoGuestTokens } from "./infrastructure/crypto/crypto-guest-tokens.js";
import { PrismaGuestLinkRepository } from "./infrastructure/persistence/prisma-guest-link-repository.js";
import { PrismaGuestResendLimiter } from "./infrastructure/persistence/prisma-guest-resend-limiter.js";
import { PrismaGuestSessionRepository } from "./infrastructure/persistence/prisma-guest-session-repository.js";

export interface GuestAccessRepositories {
  readonly links: GuestLinkRepository;
  readonly sessions: GuestSessionRepository;
  readonly resendLimiter: GuestResendLimiter;
}

export function createGuestAccessRepositories(prisma: PrismaService): GuestAccessRepositories {
  return {
    links: new PrismaGuestLinkRepository(prisma),
    sessions: new PrismaGuestSessionRepository(prisma),
    resendLimiter: new PrismaGuestResendLimiter(prisma),
  };
}

/** What the HTTP layer of the module calls (routes come next) and what the composition root hands to booking's checkout. */
export interface GuestAccessServices {
  readonly issue: IssueGuestLinkService;
  readonly exchange: ExchangeGuestLinkService;
  readonly resend: ResendGuestLinksService;
  readonly getBooking: GetGuestBookingQuery;
}

export type GuestAccessSettings = Pick<AppConfig, "frontendOrigin" | "guestLinkTtlHours" | "guestResendLimit" | "guestResendWindowMinutes">;

export interface GuestAccessServiceDeps extends GuestAccessRepositories {
  readonly clock: Clock;
  readonly email: EmailProvider;
  readonly logger: WarnLogger;
  /** Booking's public query (`createBookingServices(...).guestBookings`). */
  readonly bookings: GuestBookings;
}

export function createGuestAccessServices(config: GuestAccessSettings, deps: GuestAccessServiceDeps): GuestAccessServices {
  const { clock, links, sessions, bookings } = deps;
  const tokens = new CryptoGuestTokens();
  const issue = new IssueGuestLinkService({
    clock, links, tokens, email: deps.email, logger: deps.logger, frontendOrigin: config.frontendOrigin, linkTtlHours: config.guestLinkTtlHours,
  });
  return {
    issue,
    exchange: new ExchangeGuestLinkService({ clock, links, tokens, bookings }),
    resend: new ResendGuestLinksService({
      clock, links, sessions, tokens, bookings, issue, limiter: deps.resendLimiter, limit: config.guestResendLimit, windowMinutes: config.guestResendWindowMinutes,
    }),
    getBooking: new GetGuestBookingQuery({ clock, sessions, tokens, bookings }),
  };
}
