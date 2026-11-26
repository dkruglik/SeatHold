import { describe, expect, it } from "vitest";
import { MockPaymentGateway } from "./mock-payment-gateway.js";

const base = { idempotencyKey: "hold:1", amountMinor: 1000, currency: "EUR" };

describe("MockPaymentGateway", () => {
  it("succeeds exactly when the buyer picked succeed", async () => {
    expect(await new MockPaymentGateway().authorize({ ...base, outcomeHint: "succeed" })).toEqual({ outcome: "succeeded" });
  });

  it("fails exactly when the buyer picked fail", async () => {
    expect(await new MockPaymentGateway().authorize({ ...base, outcomeHint: "fail" })).toEqual({ outcome: "failed" });
  });
});
