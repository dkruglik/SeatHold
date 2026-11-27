import { TestThemeProvider } from "../../test/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createMemoryRouter, RouterProvider, type InitialEntry } from "react-router";
import { ApiClientProvider } from "../../app/api-client-context";
import { ApiClient } from "../../shared/lib/api-client";
import { DiscoveryPage } from "./discovery-page";
import type { Facets, ShowItem, ShowSearchResult } from "./types";

export const venueId = "3f1c1d0e-8a57-4a39-9a43-5f0b8f6f2f11";

export const facets: Facets = {
  types: ["Concert", "Theatre"],
  genres: ["Pop", "Drama"],
  countries: ["DE", "JP"],
  cities: ["Berlin", "Tokyo"],
  venues: [{ id: venueId, name: "Arena One", city: "Berlin" }],
};

export function makeItem(over: Partial<ShowItem> = {}): ShowItem {
  return {
    eventId: "e1", showId: "s1", title: "Night Songs", type: "Concert", genre: "Pop",
    venue: { id: venueId, name: "Arena One", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
    startsAt: "2026-07-01T17:30:00.000Z", priceMinor: 4550, currency: "EUR", seatsLeft: 12, ...over,
  };
}

export function makeResult(items: ShowItem[], over: Partial<ShowSearchResult> = {}): ShowSearchResult {
  return { items, total: items.length, page: 1, pageSize: 20, totalPages: items.length === 0 ? 0 : 1, ...over };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

export type SearchHandler = (query: URLSearchParams) => Response | Promise<Response>;

/** Renders the Discovery page in a memory router; `search` answers GET /api/shows, every call is recorded. */
export function renderDiscovery(entry: InitialEntry, search: SearchHandler = () => json(makeResult([makeItem()])), fakeTimers = false) {
  const searchQueries: URLSearchParams[] = [];
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/shows/facets") {
      return Promise.resolve(json(facets));
    }
    if (url.pathname === "/api/shows") {
      searchQueries.push(url.searchParams);
      return Promise.resolve(search(url.searchParams));
    }
    return Promise.resolve(json({ user: null }));
  });
  const router = createMemoryRouter(
    [{ path: "/", element: <DiscoveryPage /> }, { path: "/events/:eventId", element: <p>event page</p> }],
    { initialEntries: [entry] },
  );
  render(
    <TestThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ApiClientProvider client={new ApiClient({ apiBaseUrl: "/api" }, fetchImpl)}>
          <RouterProvider router={router} />
        </ApiClientProvider>
      </QueryClientProvider>
    </TestThemeProvider>,
  );
    return { router, searchQueries, urlParams: () => new URLSearchParams(router.state.location.search), user: userEvent.setup(fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {}) };
}

export { json };
