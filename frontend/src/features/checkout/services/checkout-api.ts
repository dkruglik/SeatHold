import type { ApiClient } from "../../../shared/lib/api-client";
import type { ConfirmedBooking, MockPaymentOutcome } from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function isBooking(body: unknown): body is ConfirmedBooking {
  return (
    isRecord(body) && typeof body.id === "string" && Array.isArray(body.seatIds) && Array.isArray(body.tickets) &&
    body.tickets.every((t) => isRecord(t) && typeof t.seatId === "string" && typeof t.code === "string") &&
    typeof body.totalMinor === "number" && typeof body.currency === "string"
  );
}

/**
 * Pays for the caller's hold. The backend derives its idempotency key from the hold id, so a retry after a failed
 * payment is the same attempt on the server and the client sends no key of its own.
 */
export class CheckoutApi {
  constructor(private readonly client: ApiClient) {}

  async checkout(eventId: string, paymentOutcome: MockPaymentOutcome, guestEmail: string | null): Promise<ConfirmedBooking> {
    const body = await this.client.post<unknown>(`/events/${eventId}/hold/checkout`, guestEmail === null ? { paymentOutcome } : { paymentOutcome, guestEmail });
    if (!isBooking(body)) {
      throw new Error("Unexpected response from POST /events/:id/hold/checkout");
    }
    return body;
  }
}
