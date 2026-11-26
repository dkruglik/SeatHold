// Public API of the guest-access module.
export { GuestAccessLink } from "./domain/guest-access-link.js";
export { GuestSession } from "./domain/guest-session.js";
export type { GuestLinkState } from "./domain/guest-link-state.js";
export { LinkExpired, LinkInvalid, LinkUsed, guestLinkErrorFor } from "./domain/errors.js";
export type { ConsumeAndCreateSession, GuestLinkRepository, NewGuestLink } from "./application/ports/guest-link-repository.js";
export type { GuestSessionRepository, NewGuestSession } from "./application/ports/guest-session-repository.js";
export type { GuestResendLimiter } from "./application/ports/guest-resend-limiter.js";
export { PrismaGuestLinkRepository } from "./infrastructure/persistence/prisma-guest-link-repository.js";
export { PrismaGuestSessionRepository } from "./infrastructure/persistence/prisma-guest-session-repository.js";
export { PrismaGuestResendLimiter } from "./infrastructure/persistence/prisma-guest-resend-limiter.js";
export type { GuestTokens } from "./application/ports/guest-tokens.js";
export type { GuestBookings } from "./application/ports/guest-bookings.js";
export { IssueGuestLinkService, type IssueGuestLinkInput } from "./application/issue-guest-link-service.js";
export { ExchangeGuestLinkService, type ExchangeResult } from "./application/exchange-guest-link-service.js";
export { ResendGuestLinksService, type ResendResult } from "./application/resend-guest-links-service.js";
export { GetGuestBookingQuery } from "./application/get-guest-booking-query.js";
export {
  createGuestAccessRepositories,
  createGuestAccessServices,
  type GuestAccessRepositories,
  type GuestAccessServiceDeps,
  type GuestAccessServices,
  type GuestAccessSettings,
} from "./guest-access-composition.js";
export { guestAccessPlugin, type GuestAccessPluginOptions } from "./presentation/http/guest-access-plugin.js";
