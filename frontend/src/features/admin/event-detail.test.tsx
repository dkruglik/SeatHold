import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { berlinEvent, boughtTicket, eventHeader, failure, json, openSeat, page, renderAdmin, type Handler } from "./admin-test-kit";

const base = `/api/admin/events/${berlinEvent.eventId}`;
const heldSeat = openSeat({ seatId: "s2", row: "A", number: 2, state: "held", heldUntil: "2026-07-01T10:15:00.000Z", releasable: true });
const staleSeat = openSeat({ seatId: "s3", row: "A", number: 3, state: "available", heldUntil: "2026-07-01T09:00:00.000Z", releasable: true });

function lists(open: Handler = () => json({ event: eventHeader, ...page([openSeat(), heldSeat]) }), bought: Handler = () => json({ event: eventHeader, ...page([boughtTicket()]) })) {
  return { [`GET ${base}/open-tickets`]: open, [`GET ${base}/bought-tickets`]: bought, "GET /api/admin/events": () => json(page([berlinEvent])) };
}

describe("Admin event detail", () => {
  it("shows the header and the open tickets, and does not fetch the bought tickets before their tab opens", async () => {
    const { callsTo } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, lists());

    expect(await screen.findByRole("heading", { name: "Night Songs" })).toBeTruthy();
    const open = await screen.findByRole("table", { name: "Open tickets" });
    expect(within(open).getAllByRole("row")).toHaveLength(3);
    expect(within(open).getByText("held")).toBeTruthy();
    expect(within(open).getByText(/12:15/).textContent).toContain("Europe/Berlin");
    expect(callsTo("GET", `${base}/bought-tickets`)).toHaveLength(0);
    expect(screen.queryByText("buyer@example.com")).toBeNull();
  });

  it("loads the bought tickets when their tab opens, with the buyer email and type but no ticket code", async () => {
    const { user, callsTo } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, lists(undefined, () => json({ event: eventHeader, ...page([boughtTicket(), boughtTicket({ ticketId: "t2", buyerEmail: "guest@example.com", buyerType: "guest" })]) })));

    await user.click(await screen.findByRole("tab", { name: "Bought tickets" }));

    const table = await screen.findByRole("table", { name: "Bought tickets" });
    expect(within(table).getByText("buyer@example.com")).toBeTruthy();
    expect(within(table).getByText("guest@example.com")).toBeTruthy();
    expect(within(table).getByText("guest")).toBeTruthy();
    expect(within(table).getAllByText(/12:00/)[0]?.textContent).toContain("Europe/Berlin");
    expect(callsTo("GET", `${base}/bought-tickets`)).toHaveLength(1);
  });

  it("shows an empty state and an error with retry in a tab", async () => {
    let calls = 0;
    const { user } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, lists(() => (++calls === 1 ? failure(500, "INTERNAL") : json({ event: eventHeader, ...page([]) }))));

    expect((await screen.findByRole("alert")).textContent).toContain("Could not load the tickets");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No open tickets")).toBeTruthy();
  });

});

describe("Admin event detail release", () => {
  it("offers Release only on releasable seats and requires a reason of at least 3 characters", async () => {
    const { user, callsTo } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, lists());

    await screen.findByRole("table", { name: "Open tickets" });
    expect(screen.getAllByRole("button", { name: /^Release/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Release seat A2" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Reason/), "ab");
    await user.click(within(dialog).getByRole("button", { name: "Release seat" }));

    expect(within(dialog).getByText(/at least 3 characters/)).toBeTruthy();
    expect(callsTo("POST", `${base}/seats/s2/release`)).toHaveLength(0);
  });

  it("labels an expired hold Clear stale hold, explains it in the modal and posts the same release request", async () => {
    const { user, callsTo } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, {
      ...lists(() => json({ event: eventHeader, ...page([openSeat(), heldSeat, staleSeat]) })),
      [`POST ${base}/seats/s3/release`]: () => json({ seatId: "s3", eventId: berlinEvent.eventId, released: true }),
    });

    await screen.findByRole("table", { name: "Open tickets" });
    expect(screen.getAllByRole("button", { name: /^Release seat/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Release seat A2" }).textContent).toBe("Release");
    const stale = screen.getByRole("button", { name: "Clear stale hold on seat A3" });
    expect(stale.textContent).toBe("Clear stale hold");
    await user.click(stale);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/hold expired but the seat is still marked held/i)).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/^Reason/), "stale hold");
    await user.click(within(dialog).getByRole("button", { name: "Release seat" }));

    await waitFor(() => expect(callsTo("POST", `${base}/seats/s3/release`)).toHaveLength(1));
    expect(callsTo("POST", `${base}/seats/s3/release`)[0]?.body).toEqual({ reason: "stale hold" });
  });

});

describe("Admin event detail release outcomes", () => {
  it("posts the release with the reason, then refetches both lists", async () => {
    const { user, callsTo } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, {
      ...lists(),
      [`POST ${base}/seats/s2/release`]: () => json({ seatId: "s2", eventId: berlinEvent.eventId, released: true }),
    });

    await user.click(await screen.findByRole("tab", { name: "Bought tickets" }));
    await screen.findByRole("table", { name: "Bought tickets" });
    await user.click(screen.getByRole("tab", { name: "Open tickets" }));
    await user.click(await screen.findByRole("button", { name: "Release seat A2" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Reason/), "Buyer called, abandoned checkout");
    await user.click(within(dialog).getByRole("button", { name: "Release seat" }));

    await waitFor(() => expect(callsTo("POST", `${base}/seats/s2/release`)).toHaveLength(1));
    expect(callsTo("POST", `${base}/seats/s2/release`)[0]?.body).toEqual({ reason: "Buyer called, abandoned checkout" });
    expect(callsTo("POST", `${base}/seats/s2/release`)[0]?.csrfToken).toBe("token-1");
    await waitFor(() => expect(callsTo("GET", `${base}/open-tickets`).length).toBeGreaterThan(1));
    await waitFor(() => expect(callsTo("GET", `${base}/bought-tickets`).length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says the seat is no longer held on 409 and refetches", async () => {
    const { user, callsTo } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, {
      ...lists(),
      [`POST ${base}/seats/s2/release`]: () => failure(409, "SEAT_NOT_HELD"),
    });

    await user.click(await screen.findByRole("button", { name: "Release seat A2" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Reason/), "stuck hold");
    await user.click(within(dialog).getByRole("button", { name: "Release seat" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain("That seat is no longer held");
    await waitFor(() => expect(callsTo("GET", `${base}/open-tickets`).length).toBeGreaterThan(1));
  });
});
