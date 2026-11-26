import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { GuestLinkRepository, NewGuestLink } from "../../application/ports/guest-link-repository.js";
import type { GuestAccessLink } from "../../domain/guest-access-link.js";
import type { GuestLinkState } from "../../domain/guest-link-state.js";
import { toGuestAccessLink } from "./guest-access-mappers.js";
import { guarded } from "./persistence-errors.js";

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

  consumeByTokenHash(tokenHash: string, now: Date): Promise<string | null> {
    return guarded("consume guest link", async () => {
      // One conditional UPDATE: of any number of concurrent callers only one matches the row.
      const rows = await this.prisma.client.$queryRaw<{ booking_id: string }[]>`
        UPDATE guest_access_links SET consumed_at = ${now}
        WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > ${now}
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
