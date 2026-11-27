import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../shared/lib/api-client";
import { type Booking } from "../../../shared/ui";
import { takeFragmentToken } from "../lib/take-fragment-token";
import type { GuestApi } from "../services/guest-api";

export type Closed = "used" | "expired" | "invalid" | "no_session" | "blocked" | "error";
export type GuestAccessState =
  | { readonly kind: "loading" }
  | { readonly kind: "booking"; readonly booking: Booking }
  | { readonly kind: "closed"; readonly reason: Closed };

const goneReasons: Record<string, Closed> = { LINK_USED: "used", LINK_EXPIRED: "expired", LINK_INVALID: "invalid" };

function reasonOf(error: unknown): Closed {
  if (!(error instanceof ApiError)) {
    return "error";
  }
  if (error.status === 410) {
    return goneReasons[error.code ?? ""] ?? "invalid";
  }
  // A 403 that outlived the client's one CSRF retry: a stale page or a wrong origin, not a server fault.
  if (error.status === 403) {
    return "blocked";
  }
  // The exchange body schema bounds the token length, so a short or corrupted fragment is a 400, not a 410.
  return error.status === 400 ? "invalid" : "error";
}

/**
 * Opens the guest access page. With a token in the fragment: remove it from the address bar, exchange it once. Without:
 * try the guest session that an earlier exchange left in its cookie. The ref keeps React StrictMode's second effect run
 * from starting a second request (the fragment is already gone by then, and the token is single use).
 */
export function useGuestAccess(api: GuestApi): GuestAccessState {
  const [state, setState] = useState<GuestAccessState>({ kind: "loading" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const token = takeFragmentToken();
    const opened = token === null ? api.currentBooking() : api.exchange(token);
    opened.then(
      (booking) => setState(booking === null ? { kind: "closed", reason: "no_session" } : { kind: "booking", booking }),
      (error: unknown) => setState({ kind: "closed", reason: reasonOf(error) }),
    );
  }, [api]);

  return state;
}
