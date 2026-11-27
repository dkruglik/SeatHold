/** What the checkout route answers with on success (201). */
export interface ConfirmedBooking {
  readonly id: string;
  readonly status: string;
  readonly eventId: string;
  readonly seatIds: readonly string[];
  readonly tickets: readonly { readonly seatId: string; readonly code: string }[];
  readonly totalMinor: number;
  readonly currency: string;
}

/**
 * The backend's mock payment gateway returns exactly the outcome the client asks for (`paymentOutcome`).
 * The client chooses it only because the gateway is a mock; a real gateway would not take a hint.
 */
export type MockPaymentOutcome = "succeed" | "fail";

/** One seat of the order, labelled for the summary. */
export interface OrderSeat {
  readonly id: string;
  readonly label: string;
}

export interface OrderSummary {
  readonly eventId: string;
  readonly eventTitle: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly seats: readonly OrderSeat[];
}

export type CheckoutSettled = "confirmed" | "hold_lost";
