import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { desktopViewport, narrowViewport, setViewport } from "../../test/viewport";
import { berlinEvent, boughtTicket, eventHeader, json, openSeat, page, renderAdmin } from "./admin-test-kit";

const base = `/api/admin/events/${berlinEvent.eventId}`;
const heldSeat = openSeat({ seatId: "s2", row: "A", number: 2, state: "held", heldUntil: "2026-07-01T10:15:00.000Z", releasable: true });
const handlers = {
  [`GET ${base}/open-tickets`]: () => json({ event: eventHeader, ...page([heldSeat], { totalPages: 3 }) }),
  [`GET ${base}/bought-tickets`]: () => json({ event: eventHeader, ...page([boughtTicket()]) }),
  "GET /api/admin/events": () => json(page([berlinEvent], { totalPages: 2 })),
};

const scroller = (table: HTMLElement) => table.closest("[class*='TableScrollContainer-scrollContainer']");

describe("Admin screens on a narrow screen", () => {
  it("titles each page with an h1 and scrolls the events table inside its own container", async () => {
    setViewport(narrowViewport);
    renderAdmin("/admin", handlers);

    expect(await screen.findByRole("heading", { level: 1, name: "Back office" })).toBeTruthy();
    expect(scroller(await screen.findByRole("table", { name: "Events" }))).not.toBeNull();
    expect(screen.getByRole("link", { name: "Create event" }).getAttribute("data-size")).toBe("lg");
  });

  it("scrolls the ticket tables inside their container and uses the large pager", async () => {
    setViewport(narrowViewport);
    renderAdmin(`/admin/events/${berlinEvent.eventId}`, handlers);

    expect(await screen.findByRole("heading", { level: 1, name: "Night Songs" })).toBeTruthy();
    expect(scroller(await screen.findByRole("table", { name: "Open tickets" }))).not.toBeNull();
    expect(screen.getByRole("button", { name: "Next page" }).closest(".mantine-Pagination-root")?.getAttribute("style")).toContain("-xl");
  });

  it("opens the release dialog full screen", async () => {
    setViewport(narrowViewport);
    const { user } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, handlers);

    await user.click(await screen.findByRole("button", { name: "Release seat A2" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("data-full-screen")).toBe("true");
  });

  it("titles the create page with an h1", async () => {
    setViewport(narrowViewport);
    renderAdmin("/admin/events/new", handlers);

    expect(await screen.findByRole("heading", { level: 1, name: "Create event" })).toBeTruthy();
  });
});

describe("Admin screens on a desktop screen", () => {
  it("opens the release dialog as a regular dialog", async () => {
    setViewport(desktopViewport);
    const { user } = renderAdmin(`/admin/events/${berlinEvent.eventId}`, handlers);

    await user.click(await screen.findByRole("button", { name: "Release seat A2" }));

    expect((await screen.findByRole("dialog")).getAttribute("data-full-screen")).toBeNull();
  });
});
