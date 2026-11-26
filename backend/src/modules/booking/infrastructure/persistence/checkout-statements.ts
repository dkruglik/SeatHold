import type { Prisma } from "../../../../generated/prisma/client.js";
import type { CheckoutAttempt } from "../../application/ports/checkout-repository.js";
import { holderColumns } from "./hold-mappers.js";

export type Tx = Prisma.TransactionClient;

/** Payment outcomes a later attempt may overwrite: anything but `succeeded`. */
export function upsertPayment(tx: Tx, attempt: CheckoutAttempt, outcome: "succeeded" | "failed" | "voided"): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO payments (hold_id, idempotency_key, amount_minor, outcome, created_at)
    VALUES (${attempt.holdId}::uuid, ${attempt.idempotencyKey}, ${attempt.total.minor}, ${outcome}, ${attempt.now})
    ON CONFLICT (idempotency_key) DO UPDATE SET outcome = EXCLUDED.outcome WHERE payments.outcome <> 'succeeded'`;
}

/** Inserts the booking row with the status given; returns its id. */
export async function insertBooking(tx: Tx, attempt: CheckoutAttempt, status: "confirmed" | "rejected"): Promise<string | undefined> {
  const { userId } = holderColumns(attempt.holder);
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO bookings (hold_id, event_id, user_id, guest_email, status, unit_price_minor, total_minor, currency, created_at)
    VALUES (${attempt.holdId}::uuid, ${attempt.eventId}::uuid, ${userId}::uuid, ${attempt.guestEmail}, ${status},
            ${attempt.unitPrice.minor}, ${attempt.total.minor}, ${attempt.total.currency}, ${attempt.now})
    ON CONFLICT (hold_id) DO NOTHING
    RETURNING id`;
  return rows[0]?.id;
}

export async function lockActiveHold(tx: Tx, holdId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM holds WHERE id = ${holdId}::uuid AND status = 'active' FOR UPDATE`;
  return rows.length === 1;
}

/** The confirm UPDATE of the plan (D1, D4): every seat of the hold still held, not yet expired at `now`. */
export async function sellHeldSeats(tx: Tx, holdId: string, now: Date): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE seats SET status = 'sold', held_until = NULL
    WHERE hold_id = ${holdId}::uuid AND status = 'held' AND held_until > ${now}
    RETURNING id`;
  return rows.map((r) => r.id);
}

export async function insertTickets(tx: Tx, bookingId: string, seatIds: readonly string[], codes: readonly string[], now: Date): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO tickets (booking_id, seat_id, code, created_at)
    SELECT ${bookingId}::uuid, t.seat_id, t.code, ${now} FROM unnest(${[...seatIds]}::uuid[], ${[...codes]}::text[]) AS t(seat_id, code)`;
}

export async function convertHold(tx: Tx, holdId: string): Promise<void> {
  await tx.$executeRaw`UPDATE holds SET status = 'converted' WHERE id = ${holdId}::uuid AND status = 'active'`;
}
