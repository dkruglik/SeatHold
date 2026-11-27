import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { HoldSweeper } from "../../application/ports/hold-sweeper.js";
import { guarded } from "../../../../shared/persistence/guarded.js";

/**
 * Bounded batch UPDATEs. SKIP LOCKED lets concurrent sweepers (and in-flight hold transactions) pass over rows
 * someone else is changing, so instances never wait on or double-process a row. `now` is always bound.
 */
export class PrismaHoldSweeper implements HoldSweeper {
  constructor(private readonly prisma: PrismaService) {}

  freeExpiredSeats(now: Date, limit: number): Promise<number> {
    return guarded("sweep expired seats", () =>
      this.prisma.client.$executeRaw`
        UPDATE seats SET status = 'available', hold_id = NULL, held_until = NULL
        WHERE id IN (
          SELECT id FROM seats WHERE status = 'held' AND held_until <= ${now}
          LIMIT ${limit} FOR UPDATE SKIP LOCKED
        )`,
    );
  }

  expireEmptyHolds(now: Date, limit: number): Promise<number> {
    return guarded("sweep expired holds", () =>
      this.prisma.client.$executeRaw`
        UPDATE holds SET status = 'expired'
        WHERE id IN (
          SELECT h.id FROM holds h
          WHERE h.status = 'active' AND h.expires_at <= ${now}
            AND NOT EXISTS (SELECT 1 FROM seats s WHERE s.hold_id = h.id)
          LIMIT ${limit} FOR UPDATE OF h SKIP LOCKED
        )`,
    );
  }
}
