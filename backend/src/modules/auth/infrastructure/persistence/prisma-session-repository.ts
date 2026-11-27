import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { NewSession, SessionRepository } from "../../application/ports/session-repository.js";
import type { ActiveSession, Session } from "../../domain/session.js";
import { toActiveSession, toSession } from "./auth-mappers.js";
import { guarded } from "./persistence-errors.js";

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(session: NewSession): Promise<Session> {
    return guarded("create session", async () => {
      const row = await this.prisma.client.session.create({
        data: {
          userId: session.userId,
          tokenHash: session.tokenHash,
          expiresAt: session.expiresAt,
          createdAt: session.now,
        },
      });
      return toSession(row);
    });
  }

  findActiveByTokenHash(tokenHash: string, now: Date): Promise<ActiveSession | null> {
    return guarded("find active session", async () => {
      const row = await this.prisma.client.session.findFirst({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
        include: { user: true },
      });
      return row ? toActiveSession(row) : null;
    });
  }

  revoke(sessionId: string, now: Date): Promise<void> {
    return guarded("revoke session", async () => {
      await this.prisma.client.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  revokeAllForUser(userId: string, now: Date): Promise<void> {
    return guarded("revoke user sessions", async () => {
      await this.prisma.client.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    });
  }
}
