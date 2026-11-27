import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, type InitialEntry } from "react-router";
import { ApiClientProvider } from "../app/api-client-context";
import { App } from "../app/app";
import { routes } from "../app/router";
import { ApiClient } from "../shared/lib/api-client";
import { createFakeBackend, type FakeBackend, type FakeBackendOptions } from "./fake-backend";

/** Renders the real routes in a memory router against the fake backend, through the real ApiClient. */
export function renderRoutes(entry: InitialEntry, options: FakeBackendOptions = {}) {
  const backend: FakeBackend = createFakeBackend(options);
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <ApiClientProvider client={new ApiClient({ apiBaseUrl: "/api" }, backend.fetchImpl)}>
      <App router={router} />
    </ApiClientProvider>,
  );
  return { backend, router, user: userEvent.setup() };
}
