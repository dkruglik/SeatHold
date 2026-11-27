import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { berlinEvent, failure, json, page, renderAdmin } from "./admin-test-kit";

describe("Admin events list", () => {
  it("lists events with the start in the venue timezone, the price and the seat counts", async () => {
    renderAdmin("/admin", { "GET /api/admin/events": () => json(page([berlinEvent])) });

    const row = (await screen.findByRole("row", { name: /Night Songs/ }));
    const cells = within(row);
    expect(cells.getByText(/Arena One/).textContent).toContain("Berlin");
    expect(cells.getByText(/19:30/).textContent).toContain("Europe/Berlin");
    expect(cells.getByText("€45.50")).toBeTruthy();
    expect(cells.getByText("200")).toBeTruthy();
    expect(cells.getByText("12")).toBeTruthy();
    expect(cells.getByText("3")).toBeTruthy();
    expect(cells.getByText("185")).toBeTruthy();
    expect(cells.getByRole("link", { name: "Night Songs" }).getAttribute("href")).toBe(`/admin/events/${berlinEvent.eventId}`);
  });

  it("offers a Create event link", async () => {
    renderAdmin("/admin", { "GET /api/admin/events": () => json(page([])) });

    expect((await screen.findByRole("link", { name: "Create event" })).getAttribute("href")).toBe("/admin/events/new");
  });

  it("requests the next page when the pager moves", async () => {
    const { user, callsTo } = renderAdmin("/admin", {
      "GET /api/admin/events": (call) => json(page([berlinEvent], { page: Number(call.query.get("page")), totalPages: 3 })),
    });

    await screen.findByRole("row", { name: /Night Songs/ });
    await user.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => expect(callsTo("GET", "/api/admin/events").some((call) => call.query.get("page") === "2")).toBe(true));
  });

  it("shows an empty state", async () => {
    renderAdmin("/admin", { "GET /api/admin/events": () => json(page([])) });

    expect(await screen.findByText("No events yet")).toBeTruthy();
  });

  it("shows an error and retries on request", async () => {
    let calls = 0;
    const { user } = renderAdmin("/admin", { "GET /api/admin/events": () => (++calls === 1 ? failure(500, "INTERNAL") : json(page([berlinEvent]))) });

    expect((await screen.findByRole("alert")).textContent).toContain("Could not load events");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByRole("row", { name: /Night Songs/ });
    expect(calls).toBe(2);
  });
});
