import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRoutes } from "../../../test/render-routes";

async function signInFlow(user: ReturnType<typeof renderRoutes>["user"], code = "123456") {
  await user.type(await screen.findByLabelText(/^Email/), "ann@example.com");
  await user.click(screen.getByRole("button", { name: "Send code" }));
  await user.type(await screen.findByLabelText(/^6-digit code/), code);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  it("sends the email, then the code, and lands on the page the user came from", async () => {
    const { user, backend, router } = renderRoutes({ pathname: "/login", state: { from: "/admin" } }, { roleOnLogin: "admin" });

    await signInFlow(user);

    await screen.findByRole("heading", { name: "Back office" });
    expect(router.state.location.pathname).toBe("/admin");
    const posts = backend.calls.filter((call) => call.method === "POST");
    expect(posts.map((call) => [call.path, call.body])).toEqual([
      ["/auth/request-code", { email: "ann@example.com" }],
      ["/auth/verify", { email: "ann@example.com", code: "123456" }],
    ]);
    expect(posts.every((call) => call.csrfToken === "token-1" && call.credentials === "include")).toBe(true);
  });

  it("lands on / when there is no previous page", async () => {
    const { user, router } = renderRoutes("/login");

    await signInFlow(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example"])("ignores the malicious previous page %s", async (from) => {
    const { user, router } = renderRoutes({ pathname: "/login", state: { from } });

    await signInFlow(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.pathname).not.toContain("evil");
  });

});

describe("LoginPage errors and hints", () => {
  it("shows an announced error for a wrong code, stays on the code step and allows a retry", async () => {
    const { user, router } = renderRoutes("/login");

    await signInFlow(user, "000000");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not right or has expired/i);
    expect(router.state.location.pathname).toBe("/login");
    const input = screen.getByLabelText(/^6-digit code/);
    await user.clear(input);
    await user.type(input, "123456{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("rejects a code that is not 6 digits without calling the API", async () => {
    const { user, backend } = renderRoutes("/login");

    await signInFlow(user, "12");

    expect((await screen.findByRole("alert")).textContent).toMatch(/6-digit/i);
    expect(backend.calls.some((call) => call.path === "/auth/verify")).toBe(false);
  });

  it("shows the retry time when the code request is rate limited and stays on the email step", async () => {
    const { user } = renderRoutes("/login", { rateLimitedForSeconds: 45 });

    await user.type(await screen.findByLabelText(/^Email/), "ann@example.com{Enter}");

    expect((await screen.findByRole("alert")).textContent).toContain("Try again in 45 seconds");
    expect(screen.queryByLabelText(/^6-digit code/)).toBeNull();
  });

  it("offers a way back from the code step to the email step", async () => {
    const { user } = renderRoutes("/login");
    await user.type(await screen.findByLabelText(/^Email/), "ann@example.com{Enter}");
    await screen.findByLabelText(/^6-digit code/);

    await user.click(screen.getByRole("button", { name: /different email|send a new code/i }));

    expect(((await screen.findByLabelText(/^Email/)) as HTMLInputElement).value).toBe("ann@example.com");
  });

  it("uses the platform hints for email and one-time code inputs", async () => {
    const { user } = renderRoutes("/login");
    const email = await screen.findByLabelText(/^Email/);
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(email.getAttribute("type")).toBe("email");

    await user.type(email, "ann@example.com{Enter}");

    const code = await screen.findByLabelText(/^6-digit code/);
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
  });

  it("writes nothing to web storage during sign-in", async () => {
    const { user } = renderRoutes("/login");

    await signInFlow(user);

    await waitFor(() => expect(localStorage.length).toBe(0));
    expect(sessionStorage.length).toBe(0);
  });
});
