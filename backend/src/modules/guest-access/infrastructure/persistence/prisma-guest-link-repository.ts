import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { ConsumeAndCreateSession, GuestLinkRepository, NewGuestLink } from "../../application/ports/guest-link-repository.js";
import type { GuestAccessLink } from "../../domain/guest-access-link.js";
import type { GuestLinkState } from "../../domain/guest-link-state.js";
import { toGuestAccessLink } from "./guest-access-mappers.js";
import { guarded } from "../../../../shared/persistence/guarded.js";

export class PrismaGuestLinkRepository implements GuestLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(link: NewGuestLink): Promise<GuestAccessLink> {
    return guarded("create guest link", async () => {
      const row = await this.prisma.client.guestAccessLink.create({
        data: { bookingId: link.bookingId, tokenHash: link.tokenHash, expiresAt: link.expiresAt, createdAt: link.now },
      });
      return toGuestAccessLink(row);
    });
  }

  findUsableBookingIdByTokenHash(tokenHash: string, now: Date): Promise<string | null> {
    return guarded("read usable guest link", async () => {
      const row = await this.prisma.client.guestAccessLink.findFirst({
        where: { tokenHash, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
        select: { bookingId: true },
      });
      return row?.bookingId ?? null;
    });
  }

  consumeAndCreateSession(input: ConsumeAndCreateSession): Promise<string | null> {
    return guarded("consume guest link and create session", async () => {
      // One statement: the conditional UPDATE lets only one concurrent caller match the row, and the INSERT runs only for
      // that row, so the link is never consumed without its session (and a failing INSERT rolls the UPDATE back).
      const rows = await this.prisma.client.$queryRaw<{ booking_id: string }[]>`
        WITH consumed AS (
          UPDATE guest_access_links SET consumed_at = ${input.now}
          WHERE token_hash = ${input.tokenHash} AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > ${input.now}
          RETURNING booking_id)
        INSERT INTO guest_sessions (booking_id, token_hash, expires_at, created_at)
        SELECT booking_id, ${input.sessionTokenHash}, ${input.sessionExpiresAt}, ${input.now} FROM consumed
        RETURNING booking_id`;
      return rows[0]?.booking_id ?? null;
    });
  }

  findStateByTokenHash(tokenHash: string, now: Date): Promise<GuestLinkState> {
    return guarded("read guest link state", async () => {
      const row = await this.prisma.client.guestAccessLink.findUnique({
        where: { tokenHash },
        select: { consumedAt: true, invalidatedAt: true, expiresAt: true },
      });
      if (row === null) return "unknown";
      if (row.consumedAt !== null) return "used";
      if (row.invalidatedAt !== null) return "invalidated";
      return row.expiresAt <= now ? "expired" : "usable";
    });
  }

  invalidateUnusedForBookings(bookingIds: readonly string[], now: Date): Promise<void> {
    return guarded("invalidate guest links", async () => {
      await this.prisma.client.guestAccessLink.updateMany({
        where: { bookingId: { in: [...bookingIds] }, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
    });
  }
}
