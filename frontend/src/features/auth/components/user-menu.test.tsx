import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRoutes } from "../../../test/render-routes";

const buyer = { id: "u1", email: "buyer@example.com", role: "buyer" } as const;

describe("UserMenu on the home layout", () => {
  it("offers Sign in to an anonymous visitor", async () => {
    const { user, router } = renderRoutes("/");

    await user.click(await screen.findByRole("link", { name: "Sign in" }));

    expect(router.state.location.pathname).toBe("/login");
  });

  it("links a signed-in user to My bookings", async () => {
    renderRoutes("/", { user: buyer });

    const link = await screen.findByRole("link", { name: "My bookings" });

    expect(link.getAttribute("href")).toBe("/bookings");
  });

  it("shows the email and logs out: calls the API with the CSRF token, goes anonymous and stays on home", async () => {
    const { user, backend, router } = renderRoutes("/", { user: buyer });
    await screen.findByText("buyer@example.com");

    await user.click(screen.getByRole("button", { name: "Log out" }));

    await screen.findByRole("link", { name: "Sign in" });
    expect(screen.queryByText("buyer@example.com")).toBeNull();
    const logout = backend.calls.find((call) => call.path === "/auth/logout");
    expect(logout).toMatchObject({ method: "POST", csrfToken: "token-1" });
    expect(router.state.location.pathname).toBe("/");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("after logout the guarded admin page sends the visitor to login", async () => {
    const { user, router } = renderRoutes("/", { user: { ...buyer, role: "admin" } });
    await user.click(await screen.findByRole("button", { name: "Log out" }));
    await screen.findByRole("link", { name: "Sign in" });

    await router.navigate("/admin");

    await screen.findByLabelText(/^Email/);
    expect(router.state.location.pathname).toBe("/login");
  });

  it("shows an alert with Retry when the account cannot be loaded, and Retry refetches", async () => {
    const { user, backend } = renderRoutes("/", { user: buyer, meFailures: 1 });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load your account");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("buyer@example.com");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(backend.calls.filter((call) => call.path === "/auth/me")).toHaveLength(2);
  });

  it("shows nothing while the account is loading", () => {
    renderRoutes("/", { user: buyer });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
