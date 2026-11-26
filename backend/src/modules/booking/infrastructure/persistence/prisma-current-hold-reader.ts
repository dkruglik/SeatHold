import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { CurrentHold, CurrentHoldReader } from "../../application/ports/current-hold-reader.js";
import type { Holder } from "../../domain/holder.js";
import { holderColumns } from "./hold-mappers.js";
import { guarded } from "./persistence-errors.js";

/** Read-only: no locks, `now` is a bound parameter. */
export class PrismaCurrentHoldReader implements CurrentHoldReader {
  constructor(private readonly prisma: PrismaService) {}

  findActive(holder: Holder, eventId: string, now: Date): Promise<CurrentHold | undefined> {
    const { userId, visitorHash } = holderColumns(holder);
    return guarded("read current hold", async () => {
      const rows = await this.prisma.client.$queryRaw<{ id: string; expires_at: Date; seat_ids: string[] }[]>`
        SELECT h.id, h.expires_at,
               COALESCE(array_agg(s.id::text ORDER BY s.row_label, s.seat_number) FILTER (WHERE s.id IS NOT NULL), '{}') AS seat_ids
        FROM holds h LEFT JOIN seats s ON s.hold_id = h.id AND s.status = 'held'
        WHERE h.event_id = ${eventId}::uuid AND h.status = 'active' AND h.expires_at > ${now}
          AND h.user_id IS NOT DISTINCT FROM ${userId}::uuid AND h.visitor_hash IS NOT DISTINCT FROM ${visitorHash}
        GROUP BY h.id`;
      const row = rows[0];
      return row === undefined ? undefined : { holdId: row.id, expiresAt: row.expires_at, seatIds: row.seat_ids };
    });
  }
}
