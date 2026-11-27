import { useMemo, useRef, useState } from "react";
import { useApiClient } from "../../../app/api-client-context";
import { toFailure, type CheckoutFailure } from "../lib/failure-message";
import { CheckoutApi } from "../services/checkout-api";
import type { CheckoutSettled, ConfirmedBooking, MockPaymentOutcome } from "../types";

export type CheckoutState =
  | { readonly status: "idle" }
  | { readonly status: "submitting" }
  | { readonly status: "confirmed"; readonly booking: ConfirmedBooking; readonly email: string | null }
  | { readonly status: "failed"; readonly failure: CheckoutFailure };

/**
 * One checkout attempt at a time: a second submit while one is in flight is ignored (a ref, so two clicks in the same
 * tick are covered). The email lives in this component state only, for the confirmation message.
 */
export function useCheckout(eventId: string, onSettled: (outcome: CheckoutSettled) => void) {
  const client = useApiClient();
  const api = useMemo(() => new CheckoutApi(client), [client]);
  const [state, setState] = useState<CheckoutState>({ status: "idle" });
  const inFlight = useRef(false);

  const submit = async (outcome: MockPaymentOutcome, email: string | null): Promise<void> => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setState({ status: "submitting" });
    try {
      const booking = await api.checkout(eventId, outcome, email);
      setState({ status: "confirmed", booking, email });
      onSettled("confirmed");
    } catch (error) {
      const failure = toFailure(error);
      setState({ status: "failed", failure });
      if (failure.kind === "expired") {
        onSettled("hold_lost");
      }
    } finally {
      inFlight.current = false;
    }
  };

  return { state, submit };
}
