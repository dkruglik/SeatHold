// Public API of the guest-access module.
export { GuestAccessLink } from "./domain/guest-access-link.js";
export { GuestSession } from "./domain/guest-session.js";
export type { GuestLinkState } from "./domain/guest-link-state.js";
export { LinkExpired, LinkInvalid, LinkUsed, guestLinkErrorFor } from "./domain/errors.js";
export type { GuestLinkRepository, NewGuestLink } from "./application/ports/guest-link-repository.js";
export type { GuestSessionRepository, NewGuestSession } from "./application/ports/guest-session-repository.js";
export type { GuestResendLimiter } from "./application/ports/guest-resend-limiter.js";
export { PrismaGuestLinkRepository } from "./infrastructure/persistence/prisma-guest-link-repository.js";
export { PrismaGuestSessionRepository } from "./infrastructure/persistence/prisma-guest-session-repository.js";
export { PrismaGuestResendLimiter } from "./infrastructure/persistence/prisma-guest-resend-limiter.js";
export { createGuestAccessRepositories, type GuestAccessRepositories } from "./guest-access-composition.js";
