import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiClientProvider } from "../../app/api-client-context";
import { theme } from "../../app/theme";
import { ApiClient } from "../../shared/lib/api-client";
import { adminRoutes } from "./routes";
import type { AdminEventRow, BoughtTicket, Lookups, OpenTicket } from "./types";

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
export const failure = (status: number, code: string, message = code) => json({ error: { code, message } }, status);

export interface Call {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
  readonly csrfToken: string | null;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export const berlinEvent: AdminEventRow = {
  eventId: "11111111-1111-4111-8111-111111111111", showTitle: "Night Songs", venueName: "Arena One", city: "Berlin", timezone: "Europe/Berlin",
  startsAt: "2026-07-01T17:30:00.000Z", priceMinor: 4550, currency: "EUR", rows: 10, seatsPerRow: 20, seatCount: 200, sold: 12, held: 3, available: 185,
};

export const lookups: Lookups = {
  shows: [{ id: "22222222-2222-4222-8222-222222222222", title: "Night Songs", type: "concert", genre: "pop" }],
  venues: [{ id: "33333333-3333-4333-8333-333333333333", name: "Arena One", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" }],
};

export const page = <T,>(items: T[], over: Partial<{ total: number; page: number; pageSize: number; totalPages: number }> = {}) => ({
  items, total: items.length, page: 1, pageSize: 20, totalPages: 1, ...over,
});

export const eventHeader = { eventId: berlinEvent.eventId, showTitle: "Night Songs", venueName: "Arena One", city: "Berlin", timezone: "Europe/Berlin", startsAt: berlinEvent.startsAt };

export const openSeat = (over: Partial<OpenTicket> = {}): OpenTicket => ({ seatId: "s1", row: "A", number: 1, state: "available", heldUntil: null, releasable: false, ...over });
export const boughtTicket = (over: Partial<BoughtTicket> = {}): BoughtTicket => ({
  ticketId: "t1", row: "B", number: 4, buyerEmail: "buyer@example.com", buyerType: "user", bookedAt: "2026-06-01T10:00:00.000Z", bookingStatus: "confirmed", ...over,
});

/** Renders the admin routes (without the guard, which has its own tests) against handlers keyed "METHOD /api/path". */
export function renderAdmin(entry: string, handlers: Record<string, Handler> = {}) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const call: Call = {
      method, path: url.pathname, query: url.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      csrfToken: new Headers(init?.headers).get("x-csrf-token"),
    };
    calls.push(call);
    if (call.path === "/api/auth/csrf") {
      return json({ csrfToken: "token-1" });
    }
    if (call.path === "/api/auth/me") {
      return json({ user: { id: "u1", email: "admin@example.com", role: "admin" } });
    }
    const handler = handlers[`${method} ${call.path}`] ?? (call.path === "/api/admin/lookups" ? () => json(lookups) : undefined);
    return handler === undefined ? failure(404, "not_found") : handler(call);
  };
  const router = createMemoryRouter([...adminRoutes, { path: "/", element: <p>home</p> }], { initialEntries: [entry] });
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient()}>
        <ApiClientProvider client={new ApiClient({ apiBaseUrl: "/api" }, fetchImpl)}>
          <RouterProvider router={router} />
        </ApiClientProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
  const callsTo = (method: string, path: string) => calls.filter((call) => call.method === method && call.path === path);
  return { router, calls, callsTo, user: userEvent.setup() };
}
