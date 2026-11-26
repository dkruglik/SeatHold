import type { AuthorizeRequest, AuthorizeResult, PaymentGateway } from "../../application/ports/payment-gateway.js";

/** Mock provider: returns exactly the outcome the buyer picked. Accepts and stores no card data. */
export class MockPaymentGateway implements PaymentGateway {
  authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    return Promise.resolve({ outcome: request.outcomeHint === "succeed" ? "succeeded" : "failed" });
  }
}
