import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { json, makeItem, makeResult, renderDiscovery } from "./discovery-test-kit";

describe("Discovery results", () => {
  it("lists one row per event with venue-timezone time, price, seats left and a link to the event", async () => {
    const tokyo = makeItem({
      eventId: "e2", title: "Kabuki Night", type: "Theatre", genre: "Drama", priceMinor: 12000, currency: "JPY", seatsLeft: 1,
      venue: { id: "v2", name: "Kabukiza", city: "Tokyo", countryCode: "JP", timezone: "Asia/Tokyo" },
      startsAt: "2026-07-01T17:30:00.000Z",
    });
    renderDiscovery("/", () => json(makeResult([makeItem(), tokyo])));

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const [first, second] = rows as [HTMLElement, HTMLElement];
    const berlin = within(first);
    expect(berlin.getByRole("heading", { level: 3, name: "Night Songs" })).toBeTruthy();
    expect(berlin.getByRole("link", { name: "Night Songs" }).getAttribute("href")).toBe("/events/e1");
    berlin.getByText("Concert");
    berlin.getByText("Pop");
    berlin.getByText("Arena One, Berlin");
    // 17:30Z is 19:30 in Berlin (CEST), 02:30 the next day in Tokyo.
    expect(berlin.getByText(/19:30/).parentElement?.textContent).toContain("Europe/Berlin");
    berlin.getByText("€45.50");
    berlin.getByText("12 seats left");
    const jp = within(second);
    expect(jp.getByText(/02:30/).parentElement?.textContent).toContain("Asia/Tokyo");
    expect(jp.getByText(/Jul 2/)).toBeTruthy();
    jp.getByText("¥12,000");
    jp.getByText("1 seat left");
  });

  it("shows Sold out when no seats are left", async () => {
    renderDiscovery("/", () => json(makeResult([makeItem({ seatsLeft: 0 })])));

    await screen.findByText("Sold out");
  });

});

describe("Discovery result states", () => {
  it("shows a loading skeleton first", async () => {
    renderDiscovery("/", () => new Promise<Response>(() => undefined));

    await screen.findByRole("status", { name: "Loading events" });
  });

  it("shows the empty state, and Clear filters empties the URL and the controls", async () => {
    const { user, router } = renderDiscovery("/?type=Concert&q=zzz", (q) =>
      json(makeResult(q.size === 0 ? [makeItem()] : [])),
    );

    await screen.findByText("No events match your filters");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await screen.findByText("Night Songs");
    expect(router.state.location.search).toBe("");
    expect((screen.getByRole("combobox", { name: "Type" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement).value).toBe("");
  });

  it("shows an error alert with Retry that refetches", async () => {
    let calls = 0;
    const { user } = renderDiscovery("/", () => {
      calls += 1;
      return calls === 1 ? json({ error: { code: "INTERNAL", message: "x" } }, 500) : json(makeResult([makeItem()]));
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load events");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));

    await screen.findByText("Night Songs");
    expect(calls).toBe(2);
  });

  it("paginates: hidden for one page; a click writes page to the URL and requests it", async () => {
    const { user, urlParams, searchQueries } = renderDiscovery("/?type=Concert", (q) =>
      json(makeResult([makeItem()], { page: Number(q.get("page") ?? 1), totalPages: 3, total: 41 })),
    );

    await user.click(await screen.findByRole("button", { name: "2" }));

    await waitFor(() => expect(urlParams().get("page")).toBe("2"));
    expect(urlParams().get("type")).toBe("Concert");
    await waitFor(() => expect(searchQueries.at(-1)?.toString()).toBe("type=Concert&page=2"));
  });

  it("renders no pagination when everything fits on one page", async () => {
    renderDiscovery("/");

    await screen.findByText("Night Songs");
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});
