import { ApiError, type ApiClient } from "../../../shared/lib/api-client";
import { type Booking, isBooking } from "../../../shared/ui";

export type ResendResult =
  | { readonly kind: "sent" }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number | undefined }
  | { readonly kind: "invalid" };

function asBooking(body: unknown): Booking {
  if (!isBooking(body)) {
    throw new TypeError("Unexpected booking response");
  }
  return body;
}

/** The guest routes. A link token is only ever sent in a request body, never in a path or query. */
export class GuestApi {
  constructor(private readonly client: ApiClient) {}

  /** Throws `ApiError`: 410 with `LINK_USED`, `LINK_EXPIRED` or `LINK_INVALID`. */
  async exchange(token: string): Promise<Booking> {
    return asBooking(await this.client.post<unknown>("/guest/exchange", { token }));
  }

  /** The booking of the current guest session, or `null` when there is none (401). */
  async currentBooking(): Promise<Booking | null> {
    try {
      return asBooking(await this.client.get<unknown>("/guest/booking"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return null;
      }
      throw error;
    }
  }

  /** The answer is the same whether or not the address has bookings; only limits and bad input differ. */
  async resend(email: string): Promise<ResendResult> {
    try {
      await this.client.post<undefined>("/guest/resend", { email });
      return { kind: "sent" };
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        return { kind: "rate_limited", retryAfterSeconds: error.retryAfterSeconds };
      }
      if (error instanceof ApiError && error.status === 400) {
        return { kind: "invalid" };
      }
      throw error;
    }
  }
}
