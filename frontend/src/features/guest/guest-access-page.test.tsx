import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gone, json, makeBooking, renderGuest, secretToken } from "./guest-test-kit";

vi.mock("qrcode", () => ({ toDataURL: vi.fn((payload: string) => Promise.resolve(`data:image/png;base64,${btoa(payload)}`)) }));

afterEach(() => {
  vi.restoreAllMocks();
});

const hash = `#t=${secretToken}`;

describe("Guest access: exchange", () => {
  it("exchanges the fragment token exactly once, even under StrictMode, and posts it in the body only", async () => {
    const { exchangeCalls } = renderGuest({ hash, strict: true, exchange: () => json(makeBooking()) });

    await screen.findByRole("img", { name: "QR code for ticket CODE-ONE" });
    expect(exchangeCalls()).toHaveLength(1);
  });

  it("removes the fragment from the address bar and never renders the token", async () => {
    const { replaceState, calls } = renderGuest({ hash, exchange: () => json(makeBooking()) });

    await screen.findByText("Night Songs");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/guest/access");
    expect(replaceState).toHaveBeenCalled();
    expect(calls.find((c) => c.path === "/guest/exchange")?.body).toEqual({ token: secretToken });
    expect(document.body.innerHTML).not.toContain(secretToken);
    expect(calls.every((c) => !c.path.includes(secretToken))).toBe(true);
  });

  it("shows the booking with a QR per ticket on success", async () => {
    renderGuest({ hash, exchange: () => json(makeBooking()) });

    expect(await screen.findByRole("heading", { name: "Night Songs" })).toBeTruthy();
    expect(screen.getByText("Row C, seat 7")).toBeTruthy();
    expect(await screen.findByRole("img", { name: "QR code for ticket CODE-ONE" })).toBeTruthy();
  });

  it.each([
    ["LINK_USED", "This link was already used"],
    ["LINK_EXPIRED", "This link has expired"],
    ["LINK_INVALID", "This link is not valid"],
  ])("explains a 410 %s and offers the resend form", async (code, message) => {
    renderGuest({ hash, exchange: () => gone(code) });

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send new links" })).toBeTruthy();
    expect(document.body.innerHTML).not.toContain(secretToken);
  });

  it("treats a 400 from a short or corrupted fragment token as an invalid link, not a server error", async () => {
    const { calls } = renderGuest({ hash: "#t=tooshort", exchange: () => json({ error: { code: "invalid_request", message: "x" } }, 400) });

    expect(await screen.findByText("This link is not valid")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send new links" })).toBeTruthy();
    expect(window.location.hash).toBe("");
    expect(document.body.innerHTML).not.toContain("tooshort");
    expect(calls.find((c) => c.path === "/guest/exchange")?.body).toEqual({ token: "tooshort" });
  });

  it("shows a generic error with the resend form when the exchange fails otherwise", async () => {
    renderGuest({ hash, exchange: () => json({ error: { code: "INTERNAL", message: "x" } }, 500) });

    expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });
});

describe("Guest access: blocked exchange", () => {
  it("shows a dedicated notice and the resend form when the exchange stays 403, without the token in the page", async () => {
    renderGuest({ hash, exchange: () => json({ error: { code: "CSRF_INVALID", message: "x" } }, 403) });

    expect(await screen.findByText("We could not verify this request")).toBeTruthy();
    expect(screen.getByText("This link could not be checked. Request a new link below.")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain(secretToken);
  });
});

describe("Guest access: without a fragment", () => {
  it("shows the booking of an existing guest session", async () => {
    const { exchangeCalls } = renderGuest({ booking: () => json(makeBooking()) });

    expect(await screen.findByRole("heading", { name: "Night Songs" })).toBeTruthy();
    expect(exchangeCalls()).toHaveLength(0);
  });

  it("asks to open the link from the email, with the resend form, on 401", async () => {
    renderGuest({ booking: () => json({ error: { code: "UNAUTHENTICATED", message: "x" } }, 401) });

    expect(await screen.findByText("Open the link from your email")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });
});

const neutral = "If we found upcoming bookings for this address, we sent new links.";

describe("Guest access: lost-link form", () => {
  const unauthorized = () => json({ error: { code: "UNAUTHENTICATED", message: "x" } }, 401);

  it("posts the email and shows the same neutral message for every address", async () => {
    const { user, calls } = renderGuest({ booking: unauthorized, resend: () => new Response(null, { status: 204 }) });

    await user.type(await screen.findByLabelText("Email"), "known@example.com");
    await user.click(screen.getByRole("button", { name: "Send new links" }));
    expect(await screen.findByText(neutral)).toBeTruthy();

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "unknown@example.com");
    await user.click(screen.getByRole("button", { name: "Send new links" }));
    expect(await screen.findAllByText(neutral)).toHaveLength(1);
    expect(calls.filter((c) => c.path === "/guest/resend").map((c) => c.body)).toEqual([{ email: "known@example.com" }, { email: "unknown@example.com" }]);
  });

  it("shows a rate-limit message on 429", async () => {
    const { user } = renderGuest({ booking: unauthorized, resend: () => json({ error: { code: "RATE_LIMITED", message: "x" } }, 429) });

    await user.type(await screen.findByLabelText("Email"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Send new links" }));

    expect(await screen.findByText("Too many requests, try again later")).toBeTruthy();
    expect(screen.queryByText(neutral)).toBeNull();
  });

  it("shows the wait from retryAfterSeconds on 429", async () => {
    const limited = () => json({ error: { code: "RATE_LIMITED", message: "x" }, retryAfterSeconds: 3000 }, 429);
    const { user } = renderGuest({ booking: unauthorized, resend: limited });

    await user.type(await screen.findByLabelText("Email"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Send new links" }));

    expect(await screen.findByText("Too many requests. Try again in 50 minutes.")).toBeTruthy();
    expect(screen.queryByText("Too many requests, try again later")).toBeNull();
  });

  it("shows an inline validation message on 400", async () => {
    const { user } = renderGuest({ booking: unauthorized, resend: () => json({ error: { code: "VALIDATION", message: "x" } }, 400) });

    await user.type(await screen.findByLabelText("Email"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Send new links" }));

    expect(await screen.findByText("Enter a valid email address")).toBeTruthy();
  });

  it("disables the button while the request is in flight", async () => {
    let finish: (r: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => (finish = resolve));
    const { user } = renderGuest({ booking: unauthorized, resend: () => pending as unknown as Response });

    await user.type(await screen.findByLabelText("Email"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Send new links" }));

    const button = screen.getByRole("button", { name: /send new links/i });
    expect(button.hasAttribute("disabled") || button.getAttribute("data-loading") === "true").toBe(true);
    finish(new Response(null, { status: 204 }));
    expect(await screen.findByText(neutral)).toBeTruthy();
  });
});
