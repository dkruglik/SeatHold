import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { CheckoutAttempt, CheckoutHold, CheckoutRepository, ConfirmResult } from "../../application/ports/checkout-repository.js";
import type { Holder } from "../../domain/holder.js";
import { money } from "../../domain/money.js";
import { convertHold, insertBooking, insertTickets, lockActiveHold, sellHeldSeats, upsertPayment, type Tx } from "./checkout-statements.js";
import { holderColumns } from "./hold-mappers.js";
import { guarded } from "../../../../shared/persistence/guarded.js";
import { isUniqueViolation } from "./unique-violation.js";

const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 };

/** Thrown inside the confirm transaction to roll it back; never leaves this file. */
class SeatsLost extends Error {}

interface HoldRow {
  readonly id: string;
  readonly expires_at: Date;
  readonly seat_count: number;
  readonly price_minor: number;
  readonly currency: string;
}

export class PrismaCheckoutRepository implements CheckoutRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly newTicketCode: () => string,
  ) {}

  findHoldForCheckout(holder: Holder, eventId: string): Promise<CheckoutHold | undefined> {
    const { userId, visitorHash } = holderColumns(holder);
    return guarded("find hold for checkout", async () => {
      const rows = await this.prisma.client.$queryRaw<HoldRow[]>`
        SELECT h.id, h.expires_at, e.price_minor, e.currency,
               (SELECT count(*)::int FROM seats s WHERE s.hold_id = h.id AND s.status = 'held') AS seat_count
        FROM holds h JOIN events e ON e.id = h.event_id
        WHERE h.event_id = ${eventId}::uuid AND h.status = 'active'
          AND h.user_id IS NOT DISTINCT FROM ${userId}::uuid AND h.visitor_hash IS NOT DISTINCT FROM ${visitorHash}`;
      const row = rows[0];
      if (row === undefined) return undefined;
      return { holdId: row.id, expiresAt: row.expires_at, seatCount: row.seat_count, unitPrice: money(row.price_minor, row.currency) };
    });
  }

  recordFailedPayment(attempt: CheckoutAttempt): Promise<void> {
    return this.inTransaction("record failed payment", async (tx) => void (await upsertPayment(tx, attempt, "failed")));
  }

  voidPayment(attempt: CheckoutAttempt): Promise<void> {
    return this.inTransaction("void payment", async (tx) => void (await upsertPayment(tx, attempt, "voided")));
  }

  confirm(attempt: CheckoutAttempt): Promise<ConfirmResult> {
    return guarded("confirm checkout", async () => {
      try {
        return await this.prisma.client.$transaction((tx) => this.confirmIn(tx, attempt), TX_OPTIONS);
      } catch (error) {
        // The transaction has rolled back. Checked before `guarded` hides the database error.
        if (error instanceof SeatsLost) return { kind: "seats_lost" };
        if (isUniqueViolation(error)) return { kind: "conflict" };
        throw error;
      }
    });
  }

  recordRejection(attempt: CheckoutAttempt): Promise<void> {
    return this.inTransaction("record rejected booking", async (tx) => {
      await tx.$executeRaw`UPDATE holds SET status = 'expired' WHERE id = ${attempt.holdId}::uuid AND status = 'active'`;
      await tx.$executeRaw`
        UPDATE seats SET status = 'available', hold_id = NULL, held_until = NULL
        WHERE hold_id = ${attempt.holdId}::uuid AND status = 'held'`;
      await insertBooking(tx, attempt, "rejected");
      await upsertPayment(tx, attempt, "voided");
    });
  }

  /** The confirm transaction (plan D1, D4): lock the hold, sell its seats in one UPDATE, then booking, tickets, hold, payment. */
  private async confirmIn(tx: Tx, attempt: CheckoutAttempt): Promise<ConfirmResult> {
    if (!(await lockActiveHold(tx, attempt.holdId))) return { kind: "hold_gone" };
    const seatIds = await sellHeldSeats(tx, attempt.holdId, attempt.now);
    if (seatIds.length !== attempt.seatCount) throw new SeatsLost();
    const bookingId = await insertBooking(tx, attempt, "confirmed");
    if (bookingId === undefined) return { kind: "conflict" };
    const tickets = seatIds.map((seatId) => ({ seatId, code: this.newTicketCode() }));
    await insertTickets(tx, bookingId, seatIds, tickets.map((t) => t.code), attempt.now);
    await convertHold(tx, attempt.holdId);
    await upsertPayment(tx, attempt, "succeeded");
    const { total } = attempt;
    return { kind: "confirmed", booking: { id: bookingId, status: "confirmed", eventId: attempt.eventId, seatIds, tickets, totalMinor: total.minor, currency: total.currency } };
  }

  private inTransaction<T>(operation: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return guarded(operation, () => this.prisma.client.$transaction(work, TX_OPTIONS));
  }
}
