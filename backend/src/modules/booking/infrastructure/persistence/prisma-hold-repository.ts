import type { Prisma } from "../../../../generated/prisma/client.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { InfrastructureError } from "../../../../shared/errors/app-error.js";
import type { ActiveHold, HoldRepository, HoldTransaction } from "../../application/ports/hold-repository.js";
import type { Holder } from "../../domain/holder.js";
import { holderColumns, toActiveHold } from "./hold-mappers.js";
import { guarded, isUniqueViolation } from "./persistence-errors.js";

type Tx = Prisma.TransactionClient;

/** Raw SQL inside an interactive transaction. `now` is always a bound parameter; no statement calls now(). */
class PrismaHoldTransaction implements HoldTransaction {
  constructor(private readonly tx: Tx) {}

  async expireStaleHold(holder: Holder, eventId: string, now: Date): Promise<void> {
    const { userId, visitorHash } = holderColumns(holder);
    const stale = await this.tx.$queryRaw<{ id: string }[]>`
      UPDATE holds SET status = 'expired'
      WHERE event_id = ${eventId}::uuid AND status = 'active' AND expires_at <= ${now}
        AND user_id IS NOT DISTINCT FROM ${userId}::uuid AND visitor_hash IS NOT DISTINCT FROM ${visitorHash}
      RETURNING id`;
    if (stale.length === 0) return;
    await this.tx.$executeRaw`
      UPDATE seats SET status = 'available', hold_id = NULL, held_until = NULL
      WHERE hold_id = ANY(${stale.map((h) => h.id)}::uuid[]) AND status = 'held'`;
  }

  async findActiveHold(holder: Holder, eventId: string): Promise<ActiveHold | undefined> {
    const { userId, visitorHash } = holderColumns(holder);
    // Lock first, count second: a subselect in the locking statement would use the snapshot from before the lock wait
    // and let two parallel clicks of one holder both pass the seat cap.
    const locked = await this.tx.$queryRaw<{ id: string; expires_at: Date }[]>`
      SELECT id, expires_at FROM holds
      WHERE event_id = ${eventId}::uuid AND status = 'active'
        AND user_id IS NOT DISTINCT FROM ${userId}::uuid AND visitor_hash IS NOT DISTINCT FROM ${visitorHash}
      FOR UPDATE`;
    const hold = locked[0];
    if (hold === undefined) return undefined;
    const [{ count }] = await this.tx.$queryRaw<[{ count: number }]>`SELECT count(*)::int AS count FROM seats WHERE hold_id = ${hold.id}::uuid`;
    return toActiveHold({ id: hold.id, expires_at: hold.expires_at, seat_count: count });
  }

  async getOrCreateActiveHold(holder: Holder, eventId: string, expiresAt: Date, now: Date): Promise<ActiveHold> {
    const { userId, visitorHash } = holderColumns(holder);
    // No conflict target: the partial unique indexes (event, user) and (event, visitor) are the arbiters.
    await this.tx.$executeRaw`
      INSERT INTO holds (event_id, user_id, visitor_hash, expires_at, status, created_at)
      VALUES (${eventId}::uuid, ${userId}::uuid, ${visitorHash}, ${expiresAt}, 'active', ${now})
      ON CONFLICT DO NOTHING`;
    const hold = await this.findActiveHold(holder, eventId);
    if (hold === undefined) throw new InfrastructureError("Invariant broken: no active hold after get-or-create");
    return hold;
  }

  async tryHoldSeat(input: { eventId: string; seatId: string; holdId: string; expiresAt: Date; now: Date }): Promise<boolean> {
    const rows = await this.tx.$queryRaw<{ id: string }[]>`
      UPDATE seats SET status = 'held', hold_id = ${input.holdId}::uuid, held_until = ${input.expiresAt}
      WHERE id = ${input.seatId}::uuid AND event_id = ${input.eventId}::uuid
        AND (status = 'available' OR (status = 'held' AND held_until <= ${input.now}))
      RETURNING id`;
    return rows.length === 1;
  }

  async releaseSeat(input: { eventId: string; seatId: string; holdId: string }): Promise<boolean> {
    const count = await this.tx.$executeRaw`
      UPDATE seats SET status = 'available', hold_id = NULL, held_until = NULL
      WHERE id = ${input.seatId}::uuid AND event_id = ${input.eventId}::uuid AND hold_id = ${input.holdId}::uuid AND status = 'held'`;
    return count === 1;
  }

  async releaseHoldIfEmpty(holdId: string): Promise<void> {
    await this.tx.$executeRaw`
      UPDATE holds SET status = 'released'
      WHERE id = ${holdId}::uuid AND status = 'active' AND NOT EXISTS (SELECT 1 FROM seats WHERE hold_id = ${holdId}::uuid)`;
  }

  async seatIdsOfHold(holdId: string): Promise<string[]> {
    const rows = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM seats WHERE hold_id = ${holdId}::uuid AND status = 'held' ORDER BY row_label, seat_number`;
    return rows.map((r) => r.id);
  }

  async listActiveVisitorHolds(visitorHash: string): Promise<{ id: string; eventId: string }[]> {
    const rows = await this.tx.$queryRaw<{ id: string; event_id: string }[]>`
      SELECT id, event_id FROM holds WHERE visitor_hash = ${visitorHash} AND status = 'active' ORDER BY id FOR UPDATE`;
    return rows.map((r) => ({ id: r.id, eventId: r.event_id }));
  }

  async adoptHold(input: { holdId: string; userId: string }): Promise<boolean> {
    // A unique violation aborts a PostgreSQL transaction, so the attempt runs inside a savepoint: a user hold created
    // concurrently (after the NOT EXISTS check) rolls back to it and the caller takes the release path.
    await this.tx.$executeRaw`SAVEPOINT adopt_hold`;
    try {
      const moved = await this.tx.$executeRaw`
        UPDATE holds SET user_id = ${input.userId}::uuid, visitor_hash = NULL
        WHERE id = ${input.holdId}::uuid AND status = 'active' AND visitor_hash IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM holds u WHERE u.event_id = holds.event_id AND u.user_id = ${input.userId}::uuid AND u.status = 'active')`;
      await this.tx.$executeRaw`RELEASE SAVEPOINT adopt_hold`;
      return moved === 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.tx.$executeRaw`ROLLBACK TO SAVEPOINT adopt_hold`;
      return false;
    }
  }

  async releaseHold(holdId: string): Promise<void> {
    await this.tx.$executeRaw`
      UPDATE seats SET status = 'available', hold_id = NULL, held_until = NULL WHERE hold_id = ${holdId}::uuid AND status = 'held'`;
    await this.tx.$executeRaw`UPDATE holds SET status = 'released' WHERE id = ${holdId}::uuid AND status = 'active'`;
  }
}

export class PrismaHoldRepository implements HoldRepository {
  constructor(private readonly prisma: PrismaService) {}

  inTransaction<T>(work: (tx: HoldTransaction) => Promise<T>): Promise<T> {
    return guarded("hold transaction", () =>
      this.prisma.client.$transaction((tx) => work(new PrismaHoldTransaction(tx)), { maxWait: 10_000, timeout: 10_000 }),
    );
  }
}
