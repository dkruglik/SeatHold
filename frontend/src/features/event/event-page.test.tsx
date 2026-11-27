import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { count, eventId, makeServer, pollMs, renderEvent } from "./event-test-kit";

const seatButton = (name: string) => screen.findByRole("button", { name });
const selection = () => screen.getByRole("region", { name: "Your selection" });

afterEach(() => {
  vi.useRealTimers();
});

describe("EventPage loading", () => {
  it("shows the event header and the seat map", async () => {
    renderEvent(makeServer());

    expect(await screen.findByRole("heading", { level: 1, name: "Night Songs" })).toBeTruthy();
    expect(screen.getByText(/Arena One, Berlin/)).toBeTruthy();
    expect(screen.getByText(/Wed, Jul 1, 2026, 19:30/)).toBeTruthy();
    expect(screen.getByText(/Europe\/Berlin/)).toBeTruthy();
    expect(screen.getByText("€45.50")).toBeTruthy();
    expect(screen.getByText("6 seats left")).toBeTruthy();
    expect(await seatButton("Row B, seat 3, available")).toBeTruthy();
  });

  it("shows a busy placeholder while the event loads", () => {
    renderEvent(makeServer());

    expect(screen.getByRole("status", { name: "Loading event" })).toBeTruthy();
  });

  it("shows a not-found state for an unknown event", async () => {
    renderEvent(makeServer({ event: null }));

    expect(await screen.findByRole("heading", { name: "Event not found" })).toBeTruthy();
  });

  it("shows an error with a retry that loads the event", async () => {
    const server = makeServer({ eventFailure: { status: 500, code: "INTERNAL" } });
    const { user } = renderEvent(server);

    await screen.findByText("Could not load this event.");
    server.eventFailure = null;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Night Songs" })).toBeTruthy();
  });
});

describe("EventPage holding", () => {
  it("holds an available seat with a CSRF-protected PUT and then shows it as selected", async () => {
    const server = makeServer();
    const { user } = renderEvent(server);

    await user.click(await seatButton("Row A, seat 1, available"));

    expect(await seatButton("Row A, seat 1, selected by you")).toBeTruthy();
    expect(server.calls).toContain(`PUT /api/events/${eventId}/hold/seats/a1`);
    expect(within(selection()).getByText("Row A, seat 1")).toBeTruthy();
    expect(within(selection()).getByText("€45.50")).toBeTruthy();
  });

  it("totals several seats", async () => {
    const { user } = renderEvent(makeServer());

    await user.click(await seatButton("Row A, seat 1, available"));
    const second = await seatButton("Row A, seat 2, available");
    await waitFor(() => expect(second.getAttribute("aria-disabled")).toBeNull());
    await user.click(second);

    await waitFor(() => expect(within(selection()).getByText("€91.00")).toBeTruthy());
  });

  it("takes my seats from the hold route, not from the public map that shows them as held", async () => {
    const server = makeServer({ hold: { seatIds: ["b2"], expiresAt: Date.now() + 120_000 } });
    server.seats.b2 = "held";
    server.seats.a1 = "held";
    renderEvent(server);

    expect(await seatButton("Row B, seat 2, selected by you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Row A, seat 1, held by someone else" })).toBeTruthy();
  });

  it("releases my seat when I click it", async () => {
    const server = makeServer({ hold: { seatIds: ["a1"], expiresAt: Date.now() + 120_000 } });
    server.seats.a1 = "held";
    const { user } = renderEvent(server);

    await user.click(await seatButton("Row A, seat 1, selected by you"));

    expect(await seatButton("Row A, seat 1, available")).toBeTruthy();
    expect(server.calls).toContain(`DELETE /api/events/${eventId}/hold/seats/a1`);
    expect(within(selection()).getByText("No seats selected.")).toBeTruthy();
  });

});

describe("EventPage hold failures", () => {
  it("says the seat was just taken on 409 SEAT_UNAVAILABLE and refetches the map", async () => {
    const server = makeServer();
    const { user } = renderEvent(server);
    const target = await seatButton("Row A, seat 1, available");
    const mapCalls = count(server, `GET /api/events/${eventId}/seats`);
    server.seats.a1 = "held";
    server.holdFailure = { status: 409, code: "SEAT_UNAVAILABLE" };

    await user.click(target);

    expect((await screen.findByRole("alert")).textContent).toContain("That seat was just taken");
    expect(await seatButton("Row A, seat 1, held by someone else")).toBeTruthy();
    expect(count(server, `GET /api/events/${eventId}/seats`)).toBeGreaterThan(mapCalls);
  });

  it("explains the seat cap on 409 HOLD_LIMIT_REACHED", async () => {
    const server = makeServer({ holdFailure: { status: 409, code: "HOLD_LIMIT_REACHED" } });
    const { user } = renderEvent(server);

    await user.click(await seatButton("Row A, seat 1, available"));

    expect((await screen.findByRole("alert")).textContent).toContain("maximum number of seats");
  });

  it("shows a generic message for any other failure", async () => {
    const server = makeServer({ holdFailure: { status: 500, code: "INTERNAL" } });
    const { user } = renderEvent(server);

    await user.click(await seatButton("Row A, seat 1, available"));

    expect((await screen.findByRole("alert")).textContent).toContain("Could not update your selection");
  });
});

describe("EventPage continue", () => {
  it("disables Continue to payment without a hold", async () => {
    renderEvent(makeServer());

    const button = await screen.findByRole("button", { name: "Continue to payment" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Continue to payment with a hold and hands the hold to onContinue", async () => {
    const onContinue = vi.fn();
    const expiresAt = Date.now() + 120_000;
    const { user } = renderEvent(makeServer({ hold: { seatIds: ["a1"], expiresAt } }), { onContinue });

    const button = await screen.findByRole("button", { name: "Continue to payment" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await user.click(button);

    expect(onContinue).toHaveBeenCalledWith({ eventId, seatIds: ["a1"], expiresAt: new Date(expiresAt).toISOString() });
  });
});

describe("EventPage countdown", () => {
  it("counts down from expiresAt as mm:ss", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderEvent(makeServer({ hold: { seatIds: ["a1"], expiresAt: Date.now() + 125_000 } }), {}, true);

    expect((await screen.findByRole("timer")).textContent).toContain("02:05");
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(screen.getByRole("timer").textContent).toContain("02:00");
  });

  it("announces one minute left politely, not every tick", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderEvent(makeServer({ hold: { seatIds: ["a1"], expiresAt: Date.now() + 62_000 } }), {}, true);
    await screen.findByRole("timer");
    expect(screen.getByRole("timer").getAttribute("aria-live")).toBe("off");
    const live = screen.getByTestId("hold-announcer");
    expect(live.textContent).toBe("");

    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(live.textContent).toBe("One minute left on your hold.");
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  it("at zero clears the selection, disables Continue, says the hold expired and refetches", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = makeServer({ hold: { seatIds: ["a1"], expiresAt: Date.now() + 3000 } });
    server.seats.a1 = "held";
    renderEvent(server, {}, true);
    await screen.findByRole("button", { name: "Row A, seat 1, selected by you" });
    const holdCalls = count(server, `GET /api/events/${eventId}/hold`);

    await act(() => vi.advanceTimersByTimeAsync(4000));

    expect(await screen.findByText("Your hold expired")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Row A, seat 1, available" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue to payment" }) as HTMLButtonElement).disabled).toBe(true);
    expect(count(server, `GET /api/events/${eventId}/hold`)).toBeGreaterThan(holdCalls);
  });
});

describe("EventPage polling", () => {
  it("repeats the seat map request every poll interval and shows the new states", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = makeServer();
    renderEvent(server, {}, true);
    await screen.findByRole("button", { name: "Row B, seat 1, available" });
    const before = count(server, `GET /api/events/${eventId}/seats`);

    server.seats.b1 = "sold";
    await act(() => vi.advanceTimersByTimeAsync(pollMs + 100));

    expect(count(server, `GET /api/events/${eventId}/seats`)).toBeGreaterThan(before);
    expect(await seatButton("Row B, seat 1, sold")).toBeTruthy();
  });

  it("stops polling after the page unmounts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const server = makeServer();
    const { unmount } = renderEvent(server, {}, true);
    await screen.findByRole("button", { name: "Row B, seat 1, available" });

    unmount();
    const before = count(server, `GET /api/events/${eventId}/seats`);
    await act(() => vi.advanceTimersByTimeAsync(pollMs * 3));

    expect(count(server, `GET /api/events/${eventId}/seats`)).toBe(before);
  });
});
