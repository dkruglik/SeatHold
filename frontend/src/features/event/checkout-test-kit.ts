import { eventId, type FakeServer } from "./event-test-kit";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (status: number, code: string) => json({ error: { code, message: code } }, status);

export interface CheckoutRequest {
  readonly body: unknown;
  readonly headers: Headers;
}

export interface CheckoutKit {
  readonly requests: CheckoutRequest[];
  /** When set, the next checkout answers with this failure instead of the mock gateway outcome. */
  next: { readonly status: number; readonly code: string } | null;
}

/** The backend's auth/me and checkout routes in memory, on top of the event page's fake server. */
export function addCheckout(server: FakeServer, user: { readonly id: string; readonly email: string; readonly role: "buyer" } | null): CheckoutKit {
  const kit: CheckoutKit = { requests: [], next: null };
  server.intercept = ({ method, path, body, headers }) => {
    if (path === "/api/auth/me") {
      return json({ user });
    }
    if (method !== "POST" || path !== `/api/events/${eventId}/hold/checkout`) {
      return undefined;
    }
    kit.requests.push({ body, headers });
    if (kit.next !== null) {
      const failed = kit.next;
      kit.next = null;
      return failure(failed.status, failed.code);
    }
    const outcome = (body as { paymentOutcome?: string }).paymentOutcome;
    if (outcome === "fail") {
      return failure(402, "PAYMENT_FAILED");
    }
    const seatIds = server.hold?.seatIds ?? [];
    for (const id of seatIds) {
      server.seats[id] = "sold";
    }
    server.hold = null;
    return json({
      id: "bk-1", status: "confirmed", eventId, seatIds,
      tickets: seatIds.map((seatId, i) => ({ seatId, code: `TKT-${i + 1}` })), totalMinor: seatIds.length * 4550, currency: "EUR",
    }, 201);
  };
  return kit;
}
