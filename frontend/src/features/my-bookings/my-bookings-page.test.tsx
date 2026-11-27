import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, makeBooking, renderMyBookings } from "./my-bookings-test-kit";

vi.mock("qrcode", () => ({ toDataURL: vi.fn((payload: string) => Promise.resolve(`data:image/png;base64,${btoa(payload)}`)) }));

describe("My bookings", () => {
  it("lists bookings newest first with event, venue time, total and a QR per ticket", async () => {
    const older = makeBooking({ bookingId: "b-old", createdAt: "2026-05-01T10:00:00.000Z", event: { ...makeBooking().event, title: "Old Show" } });
    const newer = makeBooking({ bookingId: "b-new" });
    renderMyBookings(() => json([older, newer]));

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    const [first, second] = cards.map((card) => within(card));
    if (first === undefined || second === undefined) {
      throw new Error("expected two bookings");
    }
    expect(first.getByRole("heading", { name: "Night Songs" })).toBeTruthy();
    expect(second.getByRole("heading", { name: "Old Show" })).toBeTruthy();

    expect(first.getByText(/Arena One, Berlin/)).toBeTruthy();
    expect(first.getByText(/19:30/).textContent).toContain("Europe/Berlin");
    expect(first.getByText(/€91\.00/)).toBeTruthy();
    expect(first.getByText("Row C, seat 7")).toBeTruthy();
    expect(first.getByText("Row C, seat 8")).toBeTruthy();
    expect(first.getByText("CODE-ONE")).toBeTruthy();
    const qr = await first.findByRole("img", { name: "QR code for ticket CODE-ONE" });
    expect(qr.getAttribute("src")).toBe(`data:image/png;base64,${btoa("SEATHOLD:CODE-ONE")}`);
    expect(await first.findByRole("img", { name: "QR code for ticket CODE-TWO" })).toBeTruthy();
  });

  it("shows an empty state with a link to discovery", async () => {
    renderMyBookings(() => json([]));

    expect(await screen.findByText("No bookings yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find a show" }).getAttribute("href")).toBe("/");
  });

  it("asks an anonymous visitor to sign in instead of failing on 401", async () => {
    renderMyBookings(() => json({ error: { code: "UNAUTHENTICATED", message: "no" } }, 401));

    expect(await screen.findByText("Sign in to see your bookings.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("shows an error and retries on request", async () => {
    let calls = 0;
    const { user } = renderMyBookings(() => (++calls === 1 ? json({ error: { code: "INTERNAL", message: "x" } }, 500) : json([makeBooking()])));

    expect((await screen.findByRole("alert")).textContent).toContain("Could not load your bookings");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(calls).toBe(2);
  });
});
