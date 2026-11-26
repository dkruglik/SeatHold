import type { Clock } from "../../../shared/time/clock.js";
import { HoldExpired, HoldNotFound, PaymentFailed } from "../domain/errors.js";
import { parseGuestEmail } from "../domain/guest-email.js";
import type { Holder } from "../domain/holder.js";
import { totalFor } from "../domain/money.js";
import type { Booking, CheckoutAttempt, CheckoutRepository } from "./ports/checkout-repository.js";
import type { PaymentGateway, PaymentOutcomeHint } from "./ports/payment-gateway.js";

export interface CheckoutDeps {
  readonly checkout: CheckoutRepository;
  readonly payments: PaymentGateway;
  readonly clock: Clock;
}

export interface CheckoutInput {
  readonly holder: Holder;
  readonly eventId: string;
  readonly paymentOutcome: PaymentOutcomeHint;
  /** Required (and validated) for a visitor holder; ignored for a signed-in user. */
  readonly guestEmail?: string | undefined;
}

/**
 * Plan flow 4: load the hold, authorize the payment outside any transaction, then confirm in one transaction.
 * Two phases, one clock read each: lookup, expiry check and price use the first value; confirm and the
 * rejection, void or failed-payment records use a second value read after authorize returns.
 */
export class CheckoutService {
  constructor(private readonly deps: CheckoutDeps) {}

  async checkout(input: CheckoutInput): Promise<Booking> {
    const { checkout, payments, clock } = this.deps;
    const now = await clock.now();
    const hold = await checkout.findHoldForCheckout(input.holder, input.eventId);
    if (hold === undefined || hold.seatCount === 0) throw new HoldNotFound();
    if (hold.expiresAt.getTime() <= now.getTime()) throw new HoldExpired();
    const guestEmail = input.holder.kind === "visitor" ? parseGuestEmail(input.guestEmail) : null;
    const total = totalFor(hold.unitPrice, hold.seatCount);
    const attempt: CheckoutAttempt = {
      holder: input.holder, eventId: input.eventId, holdId: hold.holdId, seatCount: hold.seatCount,
      unitPrice: hold.unitPrice, total, idempotencyKey: `hold:${hold.holdId}`, now, guestEmail,
    };

    const payment = await payments.authorize({
      idempotencyKey: attempt.idempotencyKey, amountMinor: total.minor, currency: total.currency, outcomeHint: input.paymentOutcome,
    });
    // Phase 2: a fresh read after authorize, so a hold that lapsed while the payment was authorizing is not sold.
    const confirming: CheckoutAttempt = { ...attempt, now: await clock.now() };
    if (payment.outcome === "failed") {
      await checkout.recordFailedPayment(confirming);
      throw new PaymentFailed();
    }
    return this.confirm(confirming);
  }

  private async confirm(attempt: CheckoutAttempt): Promise<Booking> {
    const { checkout } = this.deps;
    const result = await checkout.confirm(attempt);
    switch (result.kind) {
      case "confirmed":
        return result.booking;
      case "seats_lost":
        await checkout.recordRejection(attempt);
        throw new HoldExpired();
      case "conflict":
        await checkout.voidPayment(attempt);
        throw new HoldExpired();
      case "hold_gone":
        // The payment was authorized: keep the audit trail. `voidPayment` never overwrites a `succeeded` row of the winning checkout.
        await checkout.voidPayment(attempt);
        throw new HoldNotFound();
    }
  }
}
