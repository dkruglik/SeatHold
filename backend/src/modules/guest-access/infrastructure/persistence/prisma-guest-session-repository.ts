import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { GuestSessionRepository, NewGuestSession } from "../../application/ports/guest-session-repository.js";
import type { GuestSession } from "../../domain/guest-session.js";
import { toGuestSession } from "./guest-access-mappers.js";
import { guarded } from "./persistence-errors.js";

export class PrismaGuestSessionRepository implements GuestSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(session: NewGuestSession): Promise<GuestSession> {
    return guarded("create guest session", async () => {
      const row = await this.prisma.client.guestSession.create({
        data: { bookingId: session.bookingId, tokenHash: session.tokenHash, expiresAt: session.expiresAt, createdAt: session.now },
      });
      return toGuestSession(row);
    });
  }

  findActiveByTokenHash(tokenHash: string, now: Date): Promise<GuestSession | null> {
    return guarded("find active guest session", async () => {
      const row = await this.prisma.client.guestSession.findFirst({ where: { tokenHash, revokedAt: null, expiresAt: { gt: now } } });
      return row ? toGuestSession(row) : null;
    });
  }

  revokeForBookings(bookingIds: readonly string[], now: Date): Promise<void> {
    return guarded("revoke guest sessions", async () => {
      await this.prisma.client.guestSession.updateMany({
        where: { bookingId: { in: [...bookingIds] }, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }
}
