import type { ApiClient } from "../../../shared/lib/api-client";
import { type Booking, isBooking } from "../../../shared/ui";

/** The signed-in user's bookings. Throws `ApiError` (401 for an anonymous caller); a malformed body is an error too. */
export class BookingsApi {
  constructor(private readonly client: ApiClient) {}

  async list(): Promise<Booking[]> {
    const body = await this.client.get<unknown>("/me/bookings");
    if (!Array.isArray(body) || !body.every(isBooking)) {
      throw new TypeError("Unexpected bookings response");
    }
    return [...body].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
