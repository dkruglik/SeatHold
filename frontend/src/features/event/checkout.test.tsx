import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addCheckout } from "./checkout-test-kit";
import { count, eventId, makeServer, renderEvent } from "./event-test-kit";

const buyer = { id: "u1", email: "ann@example.com", role: "buyer" } as const;
const guestAddress = "guest@example.com";
const checkoutCall = `POST /api/events/${eventId}/hold/checkout`;

function setup(user: typeof buyer | null, ttlMs = 120_000) {
  const server = makeServer({ hold: { seatIds: ["a1", "a2"], expiresAt: Date.now() + ttlMs } });
  server.seats.a1 = "held";
  server.seats.a2 = "held";
  return { server, kit: addCheckout(server, user) };
}

async function openCheckout(server: ReturnType<typeof makeServer>, fakeTimers = false) {
  const view = renderEvent(server, {}, fakeTimers);
  const next = await screen.findByRole("button", { name: "Continue to payment" });
  await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
  await view.user.click(next);
  await screen.findByRole("region", { name: "Checkout" });
  await screen.findByRole("button", { name: "Pay (succeed)" });
  return view;
}

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

afterEach(() => {
  vi.useRealTimers();
});

describe("Checkout panel", () => {
  it("summarises the order and labels the mock payment as a test", async () => {
    await openCheckout(setup(buyer).server);

    const panel = screen.getByRole("region", { name: "Checkout" });
    expect(within(panel).getByText("Night Songs")).toBeTruthy();
    expect(within(panel).getByText("Row A, seat 1")).toBeTruthy();
    expect(within(panel).getByText("Row A, seat 2")).toBeTruthy();
    expect(within(panel).getByText("2 x €45.50")).toBeTruthy();
    expect(within(panel).getByText("€91.00")).toBeTruthy();
    expect(within(panel).getByRole("group", { name: "Test payment" })).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toContain("Time left to pay");
  });

  it("asks a signed-out buyer for an email and blocks an invalid one", async () => {
    const { server } = setup(null);
    const { user } = await openCheckout(server);
    const email = screen.getByLabelText(/Email/) as HTMLInputElement;
    expect(email.type).toBe("email");
    expect(email.required).toBe(true);
    expect(screen.getByText("We email your ticket link here")).toBeTruthy();

    await user.type(email, "not-an-email");
    await user.click(button("Pay (succeed)"));

    expect((await screen.findByRole("alert")).textContent).toContain("valid email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(count(server, checkoutCall)).toBe(0);
  });

  it("shows no email field to a signed-in buyer", async () => {
    await openCheckout(setup(buyer).server);

    expect(screen.queryByLabelText(/Email/)).toBeNull();
  });

});

describe("Checkout panel success", () => {
  it("pays with the succeed outcome and CSRF, then confirms with ticket codes and a My bookings link", async () => {
    const { server, kit } = setup(buyer);
    const { user } = await openCheckout(server);
    const mapCalls = count(server, `GET /api/events/${eventId}/seats`);

    await user.click(button("Pay (succeed)"));

    const heading = await screen.findByRole("heading", { name: "Booking confirmed" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(kit.requests).toHaveLength(1);
    expect(kit.requests[0]?.body).toEqual({ paymentOutcome: "succeed" });
    expect(kit.requests[0]?.headers.get("x-csrf-token")).toBe("tok");
    const panel = within(screen.getByRole("region", { name: "Checkout" }));
    expect(panel.getByText("bk-1")).toBeTruthy();
    expect(panel.getByText("Row A, seat 1: TKT-1")).toBeTruthy();
    expect(panel.getByText("Row A, seat 2: TKT-2")).toBeTruthy();
    expect(panel.getByText("€91.00")).toBeTruthy();
    expect(screen.getByRole("link", { name: "My bookings" }).getAttribute("href")).toBe("/bookings");
    await waitFor(() => expect(count(server, `GET /api/events/${eventId}/seats`)).toBeGreaterThan(mapCalls));
    expect(await screen.findByRole("button", { name: "Row A, seat 1, sold" })).toBeTruthy();
    expect(screen.getByText("No seats selected.")).toBeTruthy();
  });

  it("sends the guest email and confirms with the check-your-email message and no ticket codes", async () => {
    const { server, kit } = setup(null);
    const { user } = await openCheckout(server);

    await user.type(screen.getByLabelText(/Email/), guestAddress);
    await user.click(button("Pay (succeed)"));

    await screen.findByRole("heading", { name: "Booking confirmed" });
    expect(kit.requests[0]?.body).toEqual({ paymentOutcome: "succeed", guestEmail: guestAddress });
    expect(screen.getByText(`Check your email: we sent a link to ${guestAddress} to view your ticket and QR code.`)).toBeTruthy();
    expect(screen.queryByText(/TKT-1/)).toBeNull();
    expect(screen.queryByRole("link", { name: "My bookings" })).toBeNull();
  });

});

describe("Checkout panel failures", () => {
  it("pays with the fail outcome, keeps the hold and countdown, and lets the buyer retry", async () => {
    const { server, kit } = setup(buyer);
    const { user } = await openCheckout(server);

    await user.click(button("Pay (fail)"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Payment failed. Your seats are still held, try again.");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(kit.requests[0]?.body).toEqual({ paymentOutcome: "fail" });
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Row A, seat 1, selected by you" })).toBeTruthy();
    expect(button("Pay (succeed)").disabled).toBe(false);

    await user.click(button("Pay (succeed)"));

    await screen.findByRole("heading", { name: "Booking confirmed" });
    expect(kit.requests.map((r) => r.body)).toEqual([{ paymentOutcome: "fail" }, { paymentOutcome: "succeed" }]);
  });

  it("on 409 HOLD_EXPIRED says the hold expired, disables checkout, clears the selection and refetches", async () => {
    const { server, kit } = setup(buyer);
    const { user } = await openCheckout(server);
    kit.next = { status: 409, code: "HOLD_EXPIRED" };
    server.hold = null;
    server.seats.a1 = "available";
    server.seats.a2 = "available";
    const holdCalls = count(server, `GET /api/events/${eventId}/hold`);

    await user.click(button("Pay (succeed)"));

    expect((await screen.findByRole("alert")).textContent).toContain("Your hold expired");
    await waitFor(() => expect(button("Pay (succeed)").disabled).toBe(true));
    expect(button("Pay (fail)").disabled).toBe(true);
    expect(await screen.findByRole("button", { name: "Row A, seat 1, available" })).toBeTruthy();
    expect(count(server, `GET /api/events/${eventId}/hold`)).toBeGreaterThan(holdCalls);
  });

  it("shows a generic message for another 4xx and a retryable one for 500, keeping the hold", async () => {
    const { server, kit } = setup(buyer);
    const { user } = await openCheckout(server);

    kit.next = { status: 409, code: "SEAT_UNAVAILABLE" };
    await user.click(button("Pay (succeed)"));
    expect((await screen.findByRole("alert")).textContent).toContain("could not be completed");

    kit.next = { status: 500, code: "INTERNAL" };
    await user.click(button("Pay (succeed)"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Something went wrong. Your seats are still held, try again."));
    expect(button("Pay (succeed)").disabled).toBe(false);
    expect(screen.getByRole("timer")).toBeTruthy();
  });

});

describe("Checkout panel in flight", () => {
  it("is busy while the request is in flight and posts once for a double click", async () => {
    const { server, kit } = setup(buyer);
    await openCheckout(server);
    const pending = button("Pay (succeed)");

    fireEvent.click(pending);
    fireEvent.click(pending);

    expect(button("Pay (succeed)").disabled).toBe(true);
    expect(screen.getByRole("region", { name: "Checkout" }).getAttribute("aria-busy")).toBe("true");
    await screen.findByRole("heading", { name: "Booking confirmed" });
    expect(kit.requests).toHaveLength(1);
  });

  it("disables payment when the countdown reaches zero", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { server } = setup(buyer, 3000);
    await openCheckout(server, true);

    await act(() => vi.advanceTimersByTimeAsync(4000));

    expect(button("Pay (succeed)").disabled).toBe(true);
    expect(button("Pay (fail)").disabled).toBe(true);
  });
});
