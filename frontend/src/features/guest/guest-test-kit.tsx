import { TestThemeProvider } from "../../test/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiClientProvider } from "../../app/api-client-context";
import { ApiClient } from "../../shared/lib/api-client";
import { type Booking } from "../../shared/ui";
import { GuestAccessPage } from "./guest-access-page";

export const secretToken = "tok_0123456789abcdefghijklmnopqrstuvwxyz";

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
export const gone = (code: string) => json({ error: { code, message: code } }, 410);
export const noContent = () => new Response(null, { status: 204 });

export function makeBooking(): Booking {
  return {
    bookingId: "b1", status: "confirmed", createdAt: "2026-06-01T10:00:00.000Z", totalMinor: 9100, currency: "EUR",
    event: { eventId: "e1", title: "Night Songs", startsAt: "2026-07-01T17:30:00.000Z", venueName: "Arena One", city: "Berlin", timezone: "Europe/Berlin" },
    tickets: [{ ticketId: "t1", code: "CODE-ONE", rowLabel: "C", seatNumber: 7 }],
  };
}

export interface GuestRoutes {
  exchange?: (body: unknown) => Response;
  booking?: () => Response;
  resend?: (body: unknown) => Response;
}

export interface RenderOptions extends GuestRoutes {
  /** The address-bar fragment, e.g. `#t=...`; empty when the page is opened without it. */
  hash?: string;
  strict?: boolean;
}

/** Renders the guest access page at `/guest/access<hash>` against fake guest routes; every call is recorded. */
export function renderGuest({ hash = "", strict = false, ...routes }: RenderOptions = {}) {
  window.history.replaceState(null, "", `/guest/access${hash}`);
  const replaceState = vi.spyOn(window.history, "replaceState");
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api/, "");
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === "/auth/csrf") {
      return Promise.resolve(json({ csrfToken: "csrf" }));
    }
    const answer = path === "/guest/exchange" ? routes.exchange?.(body) : path === "/guest/booking" ? routes.booking?.() : path === "/guest/resend" ? routes.resend?.(body) : undefined;
    return Promise.resolve(answer ?? json({ error: { code: "NOT_FOUND", message: "x" } }, 404));
  });
  const router = createMemoryRouter([{ path: "/guest/access", element: <GuestAccessPage /> }, { path: "/", element: <p>discovery</p> }], {
    initialEntries: ["/guest/access"],
  });
  const tree = (
    <TestThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ApiClientProvider client={new ApiClient({ apiBaseUrl: "/api" }, fetchImpl)}>
          <RouterProvider router={router} />
        </ApiClientProvider>
      </QueryClientProvider>
    </TestThemeProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  const exchangeCalls = () => calls.filter((c) => c.path === "/guest/exchange");
  return { calls, exchangeCalls, replaceState, user: userEvent.setup() };
}
