import { ApiError } from "../../../shared/lib/api-client";

export type CheckoutFailure =
  | { readonly kind: "payment"; readonly message: string }
  | { readonly kind: "expired"; readonly message: string }
  | { readonly kind: "other"; readonly message: string };

const retryable = "Something went wrong. Your seats are still held, try again.";

/** Maps the checkout route's answers to what the buyer sees. Only an expired or missing hold ends the checkout. */
export function toFailure(error: unknown): CheckoutFailure {
  if (error instanceof ApiError) {
    if (error.status === 402) {
      return { kind: "payment", message: "Payment failed. Your seats are still held, try again." };
    }
    if ((error.status === 409 && error.code === "HOLD_EXPIRED") || (error.status === 404 && error.code === "HOLD_NOT_FOUND")) {
      return { kind: "expired", message: "Your hold expired. The seats were released, pick them again to continue." };
    }
    if (error.status === 400 && error.code === "GUEST_EMAIL_INVALID") {
      return { kind: "other", message: "Enter a valid email address." };
    }
    if (error.status >= 400 && error.status < 500) {
      return { kind: "other", message: "Your order could not be completed. Check your seats and try again." };
    }
  }
  return { kind: "other", message: retryable };
}
