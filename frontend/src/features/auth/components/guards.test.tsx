import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ApiClientProvider } from "../../../app/api-client-context";
import { App } from "../../../app/app";
import { ApiClient } from "../../../shared/lib/api-client";
import { createFakeBackend } from "../../../test/fake-backend";
import { renderRoutes } from "../../../test/render-routes";
import { RequireAuth } from "./require-auth";

const buyer = { id: "u1", email: "buyer@example.com", role: "buyer" } as const;
const admin = { id: "u2", email: "admin@example.com", role: "admin" } as const;

describe("RequireAdmin", () => {
  it("redirects an anonymous visitor to the login page and remembers where they were going", async () => {
    const { router } = renderRoutes("/admin");

    await screen.findByLabelText(/^Email/);
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toEqual({ from: "/admin" });
  });

  it("shows a Not allowed page to a buyer and does not call the admin API", async () => {
    const { backend } = renderRoutes("/admin", { user: buyer });

    await screen.findByRole("heading", { name: "Not allowed" });
    expect(backend.calls.some((call) => call.path.startsWith("/admin"))).toBe(false);
  });

  it("renders the back office for an admin, reading the admin event list", async () => {
    const { backend } = renderRoutes("/admin", { user: admin });

    await screen.findByRole("heading", { name: "Back office" });
    await screen.findByText("No events yet");
    expect(backend.calls.some((call) => call.path.startsWith("/admin/events"))).toBe(true);
  });

  it("guards the create and detail pages too, and keeps buyers away from every admin call", async () => {
    const { backend } = renderRoutes("/admin/events/new", { user: buyer });

    await screen.findByRole("heading", { name: "Not allowed" });
    expect(backend.calls.some((call) => call.path.startsWith("/admin"))).toBe(false);
  });

  it("sends an anonymous visitor from an admin detail page to login", async () => {
    const { router } = renderRoutes("/admin/events/abc");

    await screen.findByLabelText(/^Email/);
    expect(router.state.location.pathname).toBe("/login");
  });
});

describe("RequireAuth", () => {
  function mount(user: typeof buyer | null) {
    const backend = createFakeBackend({ user });
    const router = createMemoryRouter(
      [
        { path: "/private", element: <RequireAuth><p>private page</p></RequireAuth> },
        { path: "/login", element: <p>login page</p> },
      ],
      { initialEntries: ["/private?x=1"] },
    );
    render(
      <ApiClientProvider client={new ApiClient({ apiBaseUrl: "/api" }, backend.fetchImpl)}>
        <App router={router} />
      </ApiClientProvider>,
    );
    return router;
  }

  it("redirects an anonymous visitor to login, remembering the path and query", async () => {
    const router = mount(null);

    await screen.findByText("login page");
    expect(router.state.location.state).toEqual({ from: "/private?x=1" });
  });

  it("renders its children for a signed-in user", async () => {
    mount(buyer);

    await screen.findByText("private page");
  });
});
