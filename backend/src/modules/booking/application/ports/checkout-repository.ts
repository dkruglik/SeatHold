import type { Holder } from "../../domain/holder.js";
import type { Money } from "../../domain/money.js";

/** The holder's active hold with what checkout needs to price it. */
export interface CheckoutHold {
  readonly holdId: string;
  readonly expiresAt: Date;
  readonly seatCount: number;
  readonly unitPrice: Money;
}

export interface BookingTicket {
  readonly seatId: string;
  /** 128-bit random, base64url; the QR payload. */
  readonly code: string;
}

export interface Booking {
  readonly id: string;
  readonly status: "confirmed";
  readonly eventId: string;
  readonly seatIds: readonly string[];
  readonly tickets: readonly BookingTicket[];
  readonly totalMinor: number;
  readonly currency: string;
}

/** Facts of one checkout attempt that every persisting step needs. */
export interface CheckoutAttempt {
  readonly holder: Holder;
  readonly eventId: string;
  readonly holdId: string;
  readonly seatCount: number;
  readonly unitPrice: Money;
  readonly total: Money;
  readonly idempotencyKey: string;
  /** The operation's single clock value. */
  readonly now: Date;
  /** Set for a visitor holder, null for a user holder. */
  readonly guestEmail: string | null;
}

/**
 * Result of the confirm transaction; everything but `confirmed` means the transaction rolled back.
 * - `seats_lost`: fewer seats still held by the hold than it has (expired and retaken).
 * - `conflict`: a database uniqueness backstop fired (ticket per seat, booking per hold).
 * - `hold_gone`: the hold is no longer active (another checkout won, or it was released).
 */
export type ConfirmResult =
  | { readonly kind: "confirmed"; readonly booking: Booking }
  | { readonly kind: "seats_lost" }
  | { readonly kind: "conflict" }
  | { readonly kind: "hold_gone" };

export interface CheckoutRepository {
  /** The holder's active hold for the event, priced from the event; undefined when there is none. */
  findHoldForCheckout(holder: Holder, eventId: string): Promise<CheckoutHold | undefined>;
  /** Records payment `failed`; the hold and its seats stay as they are. */
  recordFailedPayment(attempt: CheckoutAttempt): Promise<void>;
  /** One transaction: seats sold, booking confirmed, tickets, hold converted, payment succeeded. */
  confirm(attempt: CheckoutAttempt): Promise<ConfirmResult>;
  /** Own small transaction after a rolled-back confirm: hold expired and its seats freed, booking `rejected`, payment `voided`. */
  recordRejection(attempt: CheckoutAttempt): Promise<void>;
  /** Records payment `voided` without a booking (backstop conflicts). */
  voidPayment(attempt: CheckoutAttempt): Promise<void>;
}
