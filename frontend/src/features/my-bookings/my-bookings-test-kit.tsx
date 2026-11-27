import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiClientProvider } from "../../app/api-client-context";
import { theme } from "../../app/theme";
import { ApiClient } from "../../shared/lib/api-client";
import type { Booking } from "../../shared/ui/booking-card";
import { MyBookingsPage } from "./my-bookings-page";

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

export function makeBooking(over: Partial<Booking> = {}): Booking {
  return {
    bookingId: "b1", status: "confirmed", createdAt: "2026-06-01T10:00:00.000Z", totalMinor: 9100, currency: "EUR",
    event: { eventId: "e1", title: "Night Songs", startsAt: "2026-07-01T17:30:00.000Z", venueName: "Arena One", city: "Berlin", timezone: "Europe/Berlin" },
    tickets: [
      { ticketId: "t1", code: "CODE-ONE", rowLabel: "C", seatNumber: 7 },
      { ticketId: "t2", code: "CODE-TWO", rowLabel: "C", seatNumber: 8 },
    ],
    ...over,
  };
}

export type BookingsHandler = () => Response | Promise<Response>;

/** Renders My bookings in a memory router; `bookings` answers GET /api/me/bookings. */
export function renderMyBookings(bookings: BookingsHandler = () => json([makeBooking()])) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input) => {
    const path = new URL(String(input), "http://localhost").pathname;
    if (path === "/api/me/bookings") {
      return Promise.resolve(bookings());
    }
    return Promise.resolve(json({ user: { id: "u1", email: "a@example.com", role: "buyer" } }));
  });
  const router = createMemoryRouter(
    [
      { path: "/bookings", element: <MyBookingsPage /> },
      { path: "/", element: <p>discovery page</p> },
      { path: "/login", element: <p>login page</p> },
    ],
    { initialEntries: ["/bookings"] },
  );
  render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient()}>
        <ApiClientProvider client={new ApiClient({ apiBaseUrl: "/api" }, fetchImpl)}>
          <RouterProvider router={router} />
        </ApiClientProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
  return { router, fetchImpl, user: userEvent.setup() };
}
