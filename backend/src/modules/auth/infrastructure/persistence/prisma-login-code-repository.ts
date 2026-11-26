import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { LoginCodeRepository, NewLoginCode } from "../../application/ports/login-code-repository.js";
import { normalizeEmail } from "../../domain/email.js";
import type { LoginCode } from "../../domain/login-code.js";
import { toLoginCode } from "./auth-mappers.js";
import { guarded } from "./persistence-errors.js";

export class PrismaLoginCodeRepository implements LoginCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  countRequestsSince(email: string, since: Date): Promise<number> {
    return guarded("count login code requests", () =>
      this.prisma.client.authCode.count({ where: { email: normalizeEmail(email), createdAt: { gte: since } } }),
    );
  }

  latestCreatedAt(email: string): Promise<Date | null> {
    return guarded("read latest login code time", async () => {
      const row = await this.prisma.client.authCode.findFirst({
        where: { email: normalizeEmail(email) },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    });
  }

  oldestCreatedAtSince(email: string, since: Date): Promise<Date | null> {
    return guarded("read oldest login code time", async () => {
      const row = await this.prisma.client.authCode.findFirst({
        where: { email: normalizeEmail(email), createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    });
  }

  invalidateUnused(email: string, now: Date): Promise<void> {
    return guarded("invalidate login codes", async () => {
      await this.prisma.client.authCode.updateMany({
        where: { email: normalizeEmail(email), consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
    });
  }

  create(code: NewLoginCode): Promise<LoginCode> {
    return guarded("create login code", async () => {
      const row = await this.prisma.client.authCode.create({
        data: {
          email: normalizeEmail(code.email),
          codeHash: code.codeHash,
          expiresAt: code.expiresAt,
          createdAt: code.now,
        },
      });
      return toLoginCode(row);
    });
  }

  findLatestValid(email: string, now: Date): Promise<LoginCode | null> {
    return guarded("find valid login code", async () => {
      const row = await this.prisma.client.authCode.findFirst({
        where: { email: normalizeEmail(email), consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      });
      return row ? toLoginCode(row) : null;
    });
  }

  incrementAttempts(id: string): Promise<number> {
    return guarded("increment login code attempts", async () => {
      const row = await this.prisma.client.authCode.update({
        where: { id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      return row.attempts;
    });
  }

  consume(id: string, now: Date): Promise<boolean> {
    return guarded("consume login code", async () => {
      // One conditional UPDATE: of two concurrent callers only one matches the row.
      const result = await this.prisma.client.authCode.updateMany({
        where: { id, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      return result.count === 1;
    });
  }
}
