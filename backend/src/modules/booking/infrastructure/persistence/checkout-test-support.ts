import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { AuthorizeResult, PaymentGateway } from "../../application/ports/payment-gateway.js";
import { T0 } from "./booking-test-support.js";

/** Gateway fake that runs a hook while authorizing (outside any transaction) and then answers `outcome`. */
export class HookedGateway implements PaymentGateway {
  constructor(
    private readonly during: () => Promise<void> = () => Promise.resolve(),
    private readonly outcome: AuthorizeResult["outcome"] = "succeeded",
  ) {}

  async authorize(): Promise<AuthorizeResult> {
    await this.during();
    return { outcome: this.outcome };
  }
}

/** Resolves all waiters once `parties` have arrived: forces parallel checkouts to meet before confirming. */
export function barrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let release: () => void = () => undefined;
  const open = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    arrived += 1;
    if (arrived >= parties) release();
    await open;
  };
}

export interface BookingRow { readonly id: string; readonly status: string; readonly user_id: string | null; readonly guest_email: string | null; readonly total_minor: number; readonly unit_price_minor: number; readonly currency: string }
export interface PaymentRow { readonly hold_id: string; readonly idempotency_key: string; readonly amount_minor: number; readonly outcome: string }
export interface TicketRow { readonly seat_id: string; readonly code: string; readonly booking_id: string }

export function bookingRows(prisma: PrismaService, holdId: string): Promise<BookingRow[]> {
  return prisma.client.$queryRaw<BookingRow[]>`
    SELECT id, status, user_id, guest_email::text AS guest_email, total_minor, unit_price_minor, currency FROM bookings WHERE hold_id = ${holdId}::uuid`;
}

export function paymentRows(prisma: PrismaService, holdId: string): Promise<PaymentRow[]> {
  return prisma.client.$queryRaw<PaymentRow[]>`SELECT hold_id, idempotency_key, amount_minor, outcome FROM payments WHERE hold_id = ${holdId}::uuid`;
}

export function ticketRows(prisma: PrismaService): Promise<TicketRow[]> {
  return prisma.client.$queryRaw<TicketRow[]>`SELECT seat_id, code, booking_id FROM tickets ORDER BY seat_id`;
}

/** A converted hold with a confirmed booking and a ticket for `seatId`, written by SQL to force the UNIQUE(seat_id) backstop. */
export async function insertForeignTicket(prisma: PrismaService, eventId: string, seatId: string): Promise<void> {
  const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO holds (event_id, visitor_hash, expires_at, status, created_at)
    VALUES (${eventId}::uuid, 'foreign', ${T0}, 'converted', ${T0}) RETURNING id`;
  const [booking] = await prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO bookings (hold_id, event_id, guest_email, status, unit_price_minor, total_minor, currency, created_at)
    VALUES (${hold?.id}::uuid, ${eventId}::uuid, 'x@example.com', 'confirmed', 5000, 5000, 'EUR', ${T0}) RETURNING id`;
  await prisma.client.$executeRaw`
    INSERT INTO tickets (booking_id, seat_id, code, created_at) VALUES (${booking?.id}::uuid, ${seatId}::uuid, 'forced-code', ${T0})`;
}
