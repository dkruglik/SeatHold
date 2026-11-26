import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/errors/app-error.js";
import { HoldExpired, HoldNotFound, PaymentFailed } from "../domain/errors.js";
import { holderFrom } from "../domain/holder.js";
import { money } from "../domain/money.js";
import { CheckoutService } from "./checkout-service.js";
import { FakeCheckoutRepository } from "./in-memory-checkout-repository.test-support.js";
import type { AuthorizeRequest, PaymentGateway } from "./ports/payment-gateway.js";
import type { Booking } from "./ports/checkout-repository.js";

const T0 = new Date("2026-01-01T12:00:00Z");
const visitor = holderFrom({ visitorHash: "v1" });
const user = holderFrom({ userId: "u1" });
const booking: Booking = { id: "b1", status: "confirmed", eventId: "e", seatIds: ["s1", "s2"], tickets: [], totalMinor: 10000, currency: "EUR" };

function setup(outcome: "succeeded" | "failed" = "succeeded") {
  const repo = new FakeCheckoutRepository();
  repo.hold = { holdId: "h1", expiresAt: new Date(T0.getTime() + 60_000), seatCount: 2, unitPrice: money(5000, "EUR") };
  repo.confirmResult = { kind: "confirmed", booking };
  let reads = 0;
  const clock = { now: () => { reads += 1; return Promise.resolve(T0); } };
  const requests: AuthorizeRequest[] = [];
  const gateway: PaymentGateway = { authorize: (r) => { requests.push(r); repo.calls.push({ method: "authorize" }); return Promise.resolve({ outcome }); } };
  return { repo, requests, reads: () => reads, service: new CheckoutService({ checkout: repo, payments: gateway, clock }) };
}
const input = { eventId: "e", paymentOutcome: "succeed" as const };

describe("CheckoutService", () => {
  it("reads the clock once per phase (before and after authorize) and charges unit price times seats with a key derived from the hold", async () => {
    const { service, requests, reads, repo } = setup();

    const result = await service.checkout({ ...input, holder: visitor, guestEmail: "a@b.de" });

    expect(result).toBe(booking);
    expect(reads()).toBe(2);
    expect(requests).toEqual([{ idempotencyKey: "hold:h1", amountMinor: 10000, currency: "EUR", outcomeHint: "succeed" }]);
    expect(repo.methods()).toEqual(["find", "authorize", "confirm"]);
    expect(repo.calls[2]?.attempt).toMatchObject({ now: T0, guestEmail: "a@b.de", seatCount: 2, total: { minor: 10000, currency: "EUR" } });
  });

  it("lets a user holder check out without an email and stores none", async () => {
    const { service, repo } = setup();

    await service.checkout({ ...input, holder: user });

    expect(repo.calls.find((c) => c.method === "confirm")?.attempt?.guestEmail).toBeNull();
  });

  it("requires a valid guest email from a visitor holder before charging", async () => {
    const { service, repo } = setup();

    const error = await service.checkout({ ...input, holder: visitor }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(repo.methods()).toEqual(["find"]);
  });

});

describe("CheckoutService failure paths", () => {
  it("throws HoldNotFound without charging when the holder has no active hold", async () => {
    const { service, repo } = setup();
    repo.hold = undefined;

    await expect(service.checkout({ ...input, holder: user })).rejects.toBeInstanceOf(HoldNotFound);
    expect(repo.methods()).toEqual(["find"]);
  });

  it("throws HoldExpired without charging when the hold ended at or before now", async () => {
    const { service, repo } = setup();
    repo.hold = { ...(repo.hold as NonNullable<typeof repo.hold>), expiresAt: T0 };

    await expect(service.checkout({ ...input, holder: user })).rejects.toBeInstanceOf(HoldExpired);
    expect(repo.methods()).toEqual(["find"]);
  });

  it("records a failed payment, keeps the hold and throws PaymentFailed", async () => {
    const { service, repo } = setup("failed");

    await expect(service.checkout({ ...input, holder: user, paymentOutcome: "fail" })).rejects.toBeInstanceOf(PaymentFailed);
    expect(repo.methods()).toEqual(["find", "authorize", "failed"]);
  });

  it("records the rejection and throws HoldExpired when the seats were lost during payment", async () => {
    const { service, repo } = setup();
    repo.confirmResult = { kind: "seats_lost" };

    await expect(service.checkout({ ...input, holder: user })).rejects.toBeInstanceOf(HoldExpired);
    expect(repo.methods()).toEqual(["find", "authorize", "confirm", "reject"]);
  });

  it("voids the payment and throws HoldExpired when a uniqueness backstop fired", async () => {
    const { service, repo } = setup();
    repo.confirmResult = { kind: "conflict" };

    await expect(service.checkout({ ...input, holder: user })).rejects.toBeInstanceOf(HoldExpired);
    expect(repo.methods()).toEqual(["find", "authorize", "confirm", "void"]);
  });

  it("throws HoldNotFound and records nothing when another checkout already took the hold", async () => {
    const { service, repo } = setup();
    repo.confirmResult = { kind: "hold_gone" };

    await expect(service.checkout({ ...input, holder: user })).rejects.toBeInstanceOf(HoldNotFound);
    expect(repo.methods()).toEqual(["find", "authorize", "confirm"]);
  });
});
