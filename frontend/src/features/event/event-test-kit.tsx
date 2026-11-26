import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiClientProvider } from "../../app/api-client-context";
import { FrontendConfigProvider } from "../../app/config/config-context";
import { theme } from "../../app/theme";
import { ApiClient } from "../../shared/lib/api-client";
import { EventPage, type EventPageProps } from "./event-page";

export const eventId = "6f1c1d0e-8a57-4a39-9a43-5f0b8f6f2f11";
export const pollMs = 5000;

type ServerSeatState = "available" | "held" | "sold";

export interface Failure {
  readonly status: number;
  readonly code: string;
}

/** The backend's event-page contract in memory: the public map shows every held seat as held, mine included. */
export interface FakeServer {
  seats: Record<string, ServerSeatState>;
  /** My live hold. It lapses by itself when Date.now() reaches expiresAt, as the backend's lazy expiry does. */
  hold: { seatIds: string[]; expiresAt: number } | null;
  event: Record<string, unknown> | null;
  eventFailure: Failure | null;
  holdFailure: Failure | null;
  holdTtlMs: number;
  calls: string[];
}

const seatIds = ["a1", "a2", "a3", "b1", "b2", "b3"];

export function makeServer(over: Partial<FakeServer> = {}): FakeServer {
  return {
    seats: Object.fromEntries(seatIds.map((id) => [id, "available"])),
    hold: null,
    event: {
      eventId, showId: "s1", title: "Night Songs", type: "Concert", genre: "Pop", description: "Live",
      venue: { id: "v1", name: "Arena One", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
      startsAt: "2026-07-01T17:30:00.000Z", priceMinor: 4550, currency: "EUR", rows: 2, seatsPerRow: 3, seatsLeft: 6,
    },
    eventFailure: null,
    holdFailure: null,
    holdTtlMs: 120_000,
    calls: [],
    ...over,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = ({ status, code }: Failure) => json({ error: { code, message: code } }, status);

function liveHold(server: FakeServer) {
  if (server.hold !== null && server.hold.expiresAt <= Date.now()) {
    for (const id of server.hold.seatIds) {
      server.seats[id] = "available";
    }
    server.hold = null;
  }
  return server.hold;
}

function seatMap(server: FakeServer) {
  liveHold(server);
  return {
    event: { id: eventId, priceMinor: 4550, currency: "EUR" },
    seats: seatIds.map((id) => ({ id, row: id[0]?.toUpperCase(), number: Number(id.slice(1)), state: server.seats[id] })),
  };
}

function putHold(server: FakeServer, seatId: string): Response {
  if (server.holdFailure !== null) {
    return failure(server.holdFailure);
  }
  const hold = liveHold(server) ?? { seatIds: [], expiresAt: Date.now() + server.holdTtlMs };
  server.seats[seatId] = "held";
  server.hold = { seatIds: [...hold.seatIds, seatId], expiresAt: hold.expiresAt };
  return json({ seatIds: server.hold.seatIds, expiresAt: new Date(server.hold.expiresAt).toISOString() });
}

function deleteHold(server: FakeServer, seatId: string): Response {
  const hold = liveHold(server);
  server.seats[seatId] = "available";
  if (hold !== null) {
    const rest = hold.seatIds.filter((id) => id !== seatId);
    server.hold = rest.length === 0 ? null : { seatIds: rest, expiresAt: hold.expiresAt };
  }
  return new Response(null, { status: 204 });
}

export function handle(server: FakeServer, method: string, path: string, csrfToken: string | null = "tok"): Response {
  server.calls.push(`${method} ${path}`);
  if (method !== "GET" && csrfToken !== "tok") {
    return failure({ status: 403, code: "CSRF_INVALID" });
  }
  if (path === "/api/auth/csrf") {
    return json({ csrfToken: "tok" });
  }
  if (path === `/api/events/${eventId}`) {
    return server.eventFailure !== null ? failure(server.eventFailure) : server.event === null ? failure({ status: 404, code: "EVENT_NOT_FOUND" }) : json(server.event);
  }
  if (path === `/api/events/${eventId}/seats`) {
    return json(seatMap(server));
  }
  if (path === `/api/events/${eventId}/hold`) {
    const hold = liveHold(server);
    return hold === null ? failure({ status: 404, code: "HOLD_NOT_FOUND" }) : json({ seatIds: hold.seatIds, expiresAt: new Date(hold.expiresAt).toISOString() });
  }
  const seatId = path.split("/hold/seats/")[1];
  if (seatId !== undefined) {
    return method === "PUT" ? putHold(server, seatId) : deleteHold(server, seatId);
  }
  return failure({ status: 404, code: "not_found" });
}

export const count = (server: FakeServer, call: string) => server.calls.filter((c) => c === call).length;

/** Renders the event page at /events/:eventId against the in-memory server, through the real ApiClient. */
export function renderEvent(server: FakeServer, props: EventPageProps = {}, fakeTimers = false) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input, init) => Promise.resolve(handle(server, init?.method ?? "GET", String(input), new Headers(init?.headers).get("x-csrf-token"))));
  const router = createMemoryRouter([{ path: "/events/:eventId", element: <EventPage {...props} /> }], { initialEntries: [`/events/${eventId}`] });
  const view = render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient()}>
        <FrontendConfigProvider config={{ apiBaseUrl: "/api", seatPollIntervalMs: pollMs }}>
          <ApiClientProvider client={new ApiClient({ apiBaseUrl: "/api" }, fetchImpl)}>
            <RouterProvider router={router} />
          </ApiClientProvider>
        </FrontendConfigProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
  return { ...view, user: userEvent.setup(fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {}) };
}
