import type { onRequestAsyncHookHandler } from "fastify";
import type { MyBooking } from "../../../../booking/index.js";
import { AuthenticationError } from "../../../../../shared/errors/app-error.js";
import type { GetGuestBookingQuery } from "../../../application/get-guest-booking-query.js";
import { GUEST_SESSION_COOKIE } from "../guest-session-cookie.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The booking a live `gsid` session is scoped to, read once by the hook; null when there is no live guest session. Never a user. */
    guestSession: { readonly bookingId: string; readonly booking: MyBooking } | null;
  }
}

/** Rejects with 401 UNAUTHENTICATED unless the `gsid` cookie names a live guest session; otherwise sets `request.guestSession`. */
export function createRequireGuestSession(getBooking: Pick<GetGuestBookingQuery, "get">): onRequestAsyncHookHandler {
  return async (request) => {
    request.guestSession = null;
    const token = request.cookies[GUEST_SESSION_COOKIE];
    if (token === undefined || token === "") throw new AuthenticationError("Authentication required", { publicCode: "UNAUTHENTICATED" });
    const booking = await getBooking.get({ sessionToken: token });
    request.guestSession = { bookingId: booking.bookingId, booking };
  };
}
