import { describe, expect, it } from "vitest";
import type { WarnLogger } from "../../../shared/logging/warn-logger.js";
import { holderFrom } from "../domain/holder.js";
import { money } from "../domain/money.js";
import { CheckoutService } from "./checkout-service.js";
import { FakeCheckoutRepository } from "./in-memory-checkout-repository.test-support.js";
import type { GuestLinkIssuer, IssueGuestLinkInput } from "./ports/guest-link-issuer.js";

const T0 = new Date("2026-01-01T12:00:00Z");
const STARTS = new Date("2026-02-01T12:00:00Z");
const visitor = holderFrom({ visitorHash: "v1" });
const user = holderFrom({ userId: "u1" });

function setup(options: { outcome?: "succeeded" | "failed"; issuerFails?: boolean } = {}) {
  const repo = new FakeCheckoutRepository();
  repo.hold = { holdId: "h1", expiresAt: new Date(T0.getTime() + 60_000), seatCount: 1, unitPrice: money(5000, "EUR") };
  repo.confirmResult = { kind: "confirmed", booking: { id: "b1", status: "confirmed", eventId: "e", seatIds: ["s1"], tickets: [], totalMinor: 5000, currency: "EUR" } };
  const issued: IssueGuestLinkInput[] = [];
  const issuer: GuestLinkIssuer = {
    issue: (i) => { issued.push(i); return options.issuerFails ? Promise.reject(new Error("db down for g@example.com")) : Promise.resolve(); },
  };
  const warnings: string[] = [];
  const logger: WarnLogger = { warn: (message, fields) => { warnings.push(JSON.stringify({ message, fields })); } };
  const bookings = { findConfirmedGuestBooking: () => Promise.resolve({ bookingId: "b1", event: { title: "Rock Night", startsAt: STARTS } }) };
  const service = new CheckoutService({
    checkout: repo,
    payments: { authorize: () => Promise.resolve({ outcome: options.outcome ?? "succeeded" }) },
    clock: { now: () => Promise.resolve(T0) },
    guestLinks: { issuer, bookings, logger },
  });
  return { service, issued, warnings };
}
const input = { eventId: "e", paymentOutcome: "succeed" as const };

describe("CheckoutService guest link", () => {
  it("issues one link after a confirmed guest booking, with the event title and start", async () => {
    const { service, issued } = setup();

    await service.checkout({ ...input, holder: visitor, guestEmail: "g@example.com" });

    expect(issued).toEqual([{ bookingId: "b1", email: "g@example.com", eventStartsAt: STARTS, eventTitle: "Rock Night" }]);
  });

  it("issues nothing for a signed-in buyer", async () => {
    const { service, issued } = setup();

    await service.checkout({ ...input, holder: user });

    expect(issued).toEqual([]);
  });

  it("issues nothing when the payment fails or the booking is rejected", async () => {
    const failed = setup({ outcome: "failed" });
    await failed.service.checkout({ ...input, holder: visitor, guestEmail: "g@example.com" }).catch(() => undefined);
    expect(failed.issued).toEqual([]);
  });

  it("returns the booking and logs a redacted warning when the issuer fails", async () => {
    const { service, warnings } = setup({ issuerFails: true });

    const booking = await service.checkout({ ...input, holder: visitor, guestEmail: "g@example.com" });

    expect(booking.id).toBe("b1");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("b1");
    expect(warnings[0]).not.toContain("example.com");
  });
});
