import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import type { GuestLinkRepository } from "./application/ports/guest-link-repository.js";
import type { GuestResendLimiter } from "./application/ports/guest-resend-limiter.js";
import type { GuestSessionRepository } from "./application/ports/guest-session-repository.js";
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
