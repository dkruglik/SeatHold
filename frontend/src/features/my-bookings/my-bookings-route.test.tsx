import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRoutes } from "../../test/render-routes";

describe("/bookings route", () => {
  it("sends an anonymous visitor to the login page", async () => {
    const { router } = renderRoutes("/bookings", { user: null });

    await screen.findByRole("heading", { name: /sign in/i });
    expect(router.state.location.pathname).toBe("/login");
  });
});
