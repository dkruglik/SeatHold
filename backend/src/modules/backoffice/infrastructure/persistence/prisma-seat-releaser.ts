import type { Prisma } from "../../../../generated/prisma/client.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { SeatReleaseInput, SeatReleaseOutcome, SeatReleaser } from "../../application/ports/seat-releaser.js";
import { guarded } from "../../../../shared/persistence/guarded.js";

type Tx = Prisma.TransactionClient;

/**
 * Owned writer over booking-owned tables (DECISIONS.md): the same invariants as the buyer's release, without a holder.
 * Raw SQL in one transaction; `now` is a bound parameter, no statement calls now().
 */
export class PrismaSeatReleaser implements SeatReleaser {
  constructor(private readonly prisma: PrismaService) {}

  release(input: SeatReleaseInput): Promise<SeatReleaseOutcome> {
    return guarded("operator seat release", () =>
      this.prisma.client.$transaction((tx) => this.releaseIn(tx, input), { maxWait: 10_000, timeout: 10_000 }),
    );
  }

  private async releaseIn(tx: Tx, input: SeatReleaseInput): Promise<SeatReleaseOutcome> {
    // One conditional statement. RETURNING of a plain UPDATE would show the new (NULL) hold_id, so the old one is read
    // under the row lock in a CTE; a concurrent release waits on that lock, re-checks status = 'held' and gets zero rows.
    const freed = await tx.$queryRaw<{ hold_id: string | null }[]>`
      WITH target AS (
        SELECT id, hold_id FROM seats
        WHERE id = ${input.seatId}::uuid AND event_id = ${input.eventId}::uuid AND status = 'held'
        FOR UPDATE)
      UPDATE seats SET status = 'available', hold_id = NULL, held_until = NULL
      FROM target WHERE seats.id = target.id
      RETURNING target.hold_id`;
    const row = freed[0];
    if (row === undefined) {
      // Decided by a read after the failed update: the seat is either not in this event or not held.
      const exists = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM seats WHERE id = ${input.seatId}::uuid AND event_id = ${input.eventId}::uuid`;
      return exists.length === 0 ? "not_found" : "not_held";
    }
    const holdId = row.hold_id;
    if (holdId !== null) {
      // Same rule as the buyer's release: the hold ends with its last seat.
      await tx.$executeRaw`
        UPDATE holds SET status = 'released'
        WHERE id = ${holdId}::uuid AND status = 'active' AND NOT EXISTS (SELECT 1 FROM seats WHERE hold_id = ${holdId}::uuid)`;
    }
    await tx.$executeRaw`
      INSERT INTO seat_release_log (seat_id, event_id, hold_id, admin_user_id, reason, created_at)
      VALUES (${input.seatId}::uuid, ${input.eventId}::uuid, ${holdId}::uuid, ${input.adminUserId}::uuid, ${input.reason}, ${input.now})`;
    return "released";
  }
}
