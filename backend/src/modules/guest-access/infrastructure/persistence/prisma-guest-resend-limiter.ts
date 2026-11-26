import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { GuestResendLimiter } from "../../application/ports/guest-resend-limiter.js";
import { guarded } from "./persistence-errors.js";

export class PrismaGuestResendLimiter implements GuestResendLimiter {
  constructor(private readonly prisma: PrismaService) {}

  tryRegister(emailHash: string, now: Date, limit: number, windowMinutes: number): Promise<boolean> {
    const since = new Date(now.getTime() - windowMinutes * 60_000);
    return guarded("register guest resend attempt", () =>
      this.prisma.client.$transaction(async (tx) => {
        // Count and insert are two statements, so concurrent callers for one email are serialized by a transaction-scoped advisory lock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`guest-resend:${emailHash}`}, 0))`;
        const [{ count }] = await tx.$queryRaw<[{ count: number }]>`
          SELECT count(*)::int AS count FROM guest_resend_attempts WHERE email_hash = ${emailHash} AND attempted_at > ${since}`;
        if (count >= limit) return false;
        await tx.$executeRaw`INSERT INTO guest_resend_attempts (email_hash, attempted_at) VALUES (${emailHash}, ${now})`;
        return true;
      }),
    );
  }
}
