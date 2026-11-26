import type { CheckoutAttempt, CheckoutHold, CheckoutRepository, ConfirmResult } from "./ports/checkout-repository.js";

/** Unit-test fake: returns scripted results and records the calls it received. */
export class FakeCheckoutRepository implements CheckoutRepository {
  hold: CheckoutHold | undefined;
  confirmResult: ConfirmResult = { kind: "seats_lost" };
  readonly calls: { method: string; attempt?: CheckoutAttempt }[] = [];

  findHoldForCheckout(): Promise<CheckoutHold | undefined> {
    this.calls.push({ method: "find" });
    return Promise.resolve(this.hold);
  }

  recordFailedPayment(attempt: CheckoutAttempt): Promise<void> {
    this.calls.push({ method: "failed", attempt });
    return Promise.resolve();
  }

  confirm(attempt: CheckoutAttempt): Promise<ConfirmResult> {
    this.calls.push({ method: "confirm", attempt });
    return Promise.resolve(this.confirmResult);
  }

  recordRejection(attempt: CheckoutAttempt): Promise<void> {
    this.calls.push({ method: "reject", attempt });
    return Promise.resolve();
  }

  voidPayment(attempt: CheckoutAttempt): Promise<void> {
    this.calls.push({ method: "void", attempt });
    return Promise.resolve();
  }

  methods(): string[] {
    return this.calls.map((c) => c.method);
  }
}
