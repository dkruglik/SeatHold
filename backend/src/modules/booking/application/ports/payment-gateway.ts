/** What the buyer picked on the mock checkout. A real provider ignores it. No card data crosses this port. */
export type PaymentOutcomeHint = "succeed" | "fail";

export interface AuthorizeRequest {
  /** Deterministic per hold, so a retry of the same checkout is the same charge at a real provider. */
  readonly idempotencyKey: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly outcomeHint: PaymentOutcomeHint;
}

export interface AuthorizeResult {
  readonly outcome: "succeeded" | "failed";
}

/** Authorizes a payment. Callers never hold a database transaction open while calling it. */
export interface PaymentGateway {
  authorize(request: AuthorizeRequest): Promise<AuthorizeResult>;
}
