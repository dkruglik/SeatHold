import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, makeItem, makeResult, renderDiscovery, venueId } from "./discovery-test-kit";

afterEach(() => {
  vi.useRealTimers();
});

async function pick(user: ReturnType<typeof renderDiscovery>["user"], label: string, option: string) {
  await user.click(await screen.findByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

const lastQuery = (qs: URLSearchParams[]) => qs.at(-1)?.toString();

describe("Discovery filters and the URL", () => {
  it("requests with no params and no empty values when the URL has no filters", async () => {
    const { searchQueries } = renderDiscovery("/");

    await screen.findByText("Night Songs");
    expect(searchQueries.map(String)).toEqual([""]);
  });

  it("writes a chosen filter to the URL and sends it to the API", async () => {
    const { user, urlParams, searchQueries } = renderDiscovery("/");

    await pick(user, "Type", "Theatre");

    await waitFor(() => expect(urlParams().get("type")).toBe("Theatre"));
    await waitFor(() => expect(lastQuery(searchQueries)).toBe("type=Theatre"));
  });

  it("offers venues from the facets and writes the venue id", async () => {
    const { user, urlParams } = renderDiscovery("/");

    await pick(user, "Venue", "Arena One (Berlin)");

    await waitFor(() => expect(urlParams().get("venueId")).toBe(venueId));
  });

});

describe("Discovery filters restored from the URL", () => {
  it("restores the controls and the request from the URL on mount", async () => {
    const { searchQueries } = renderDiscovery(`/?type=Concert&country=DE&q=night&page=2`);

    expect((await screen.findByRole("combobox", { name: "Type" }) as HTMLInputElement).value).toBe("Concert");
    expect((screen.getByRole("combobox", { name: "Country" }) as HTMLInputElement).value).toBe("DE");
    expect((screen.getByRole("searchbox", { name: "Search" }) as HTMLInputElement).value).toBe("night");
    await waitFor(() => expect(searchQueries.length).toBeGreaterThan(0));
    expect(new Set(searchQueries.map(String))).toEqual(new Set(["q=night&type=Concert&country=DE&page=2"]));
  });

  it("resets the page to 1 when any filter changes", async () => {
    const { user, urlParams } = renderDiscovery("/?page=3", () => json(makeResult([makeItem()], { page: 3, totalPages: 5, total: 90 })));

    await pick(user, "Genre", "Pop");

    await waitFor(() => expect(urlParams().get("genre")).toBe("Pop"));
    expect(urlParams().has("page")).toBe(false);
  });

  it("clears a filter from the URL (and never sends it empty) when the select is cleared", async () => {
    const { user, urlParams, searchQueries } = renderDiscovery("/?type=Concert");

    await user.click(await screen.findByLabelText("Clear type"));

    await waitFor(() => expect(urlParams().has("type")).toBe(false));
    await waitFor(() => expect(lastQuery(searchQueries)).toBe(""));
  });

  it("ignores junk in the URL instead of crashing or sending it", async () => {
    const { searchQueries } = renderDiscovery("/?page=abc&country=Germany&from=yesterday&evil=1&q=");

    await screen.findByText("Night Songs");
    expect(searchQueries.map(String)).toEqual([""]);
  });

  it("debounces q: nothing in the URL before 300 ms, one update after, page reset", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, urlParams, searchQueries } = renderDiscovery("/?page=2", undefined, true);
    await screen.findByText("Night Songs");
    const before = searchQueries.length;

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "rock");
    expect(urlParams().has("q")).toBe(false);
    expect(searchQueries.length).toBe(before);
    await act(() => vi.advanceTimersByTimeAsync(300));

    await waitFor(() => expect(urlParams().get("q")).toBe("rock"));
    expect(urlParams().has("page")).toBe(false);
    await waitFor(() => expect(lastQuery(searchQueries)).toBe("q=rock"));
    expect(searchQueries.length).toBe(before + 1);
  });
});
