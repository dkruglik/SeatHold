import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRoutes } from "../test/render-routes";
import { desktopViewport, narrowViewport, setViewport } from "../test/viewport";

const signedIn = { user: { id: "u1", email: "very.long.address.for.a.narrow.phone@example.com", role: "buyer" as const } };

describe("screens on a narrow screen", () => {
  it.each([
    ["/", "Find a show"],
    ["/login", "Sign in"],
    ["/guest/access", "Your tickets"],
  ])("%s has the page h1", async (path, title) => {
    setViewport(narrowViewport);
    renderRoutes(path);

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
  });

  it("/bookings has the page h1", async () => {
    setViewport(narrowViewport);
    renderRoutes("/bookings", signedIn);

    expect(await screen.findByRole("heading", { level: 1, name: "My bookings" })).toBeTruthy();
  });

  it("uses large buttons", async () => {
    setViewport(narrowViewport);
    renderRoutes("/login");

    expect((await screen.findByRole("button", { name: "Send code" })).getAttribute("data-size")).toBe("lg");
  });

  it("folds the account menu into one button that opens the links", async () => {
    setViewport(narrowViewport);
    const { user } = renderRoutes("/", signedIn);

    const toggle = await screen.findByRole("button", { name: "Account menu" });
    expect(screen.queryByRole("menuitem", { name: "My bookings", hidden: true })).toBeNull();
    await user.click(toggle);
    // Mantine animates the dropdown with timers jsdom does not run, so it is still display:none here.

    expect(await screen.findByRole("menuitem", { name: "My bookings", hidden: true })).toBeTruthy();
    expect(await screen.findByRole("menuitem", { name: "Log out", hidden: true })).toBeTruthy();
    expect(screen.getByText(signedIn.user.email)).toBeTruthy();
  });
});

describe("screens on a desktop screen", () => {
  it("shows the account links directly and regular buttons", async () => {
    setViewport(desktopViewport);
    renderRoutes("/", signedIn);

    expect(await screen.findByRole("link", { name: "My bookings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Log out" }).getAttribute("data-size")).not.toBe("lg"));
  });
});
