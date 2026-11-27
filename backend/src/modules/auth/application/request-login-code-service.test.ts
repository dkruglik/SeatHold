import { describe, expect, it } from "vitest";
import { InfrastructureError, ValidationError } from "../../../shared/errors/app-error.js";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { HmacLoginCodeHasher } from "../infrastructure/crypto/hmac-login-code-hasher.js";
import { RandomLoginCodeGenerator } from "../infrastructure/crypto/random-login-code-generator.js";
import { deliveryFailure, InMemoryLoginCodeRepository, RecordingEmailProvider } from "./in-memory-auth-test-support.js";
import { RequestLoginCodeService, type RequestLoginCodeLimits } from "./request-login-code-service.js";

const T0 = new Date("2030-01-01T10:00:00.000Z");
const pepper = "unit-test-pepper-0123456789-abcdefghij";
const limits: RequestLoginCodeLimits = { limit: 5, windowMinutes: 15, cooldownSeconds: 60 };

function setup(overrides: Partial<RequestLoginCodeLimits> = {}) {
  const clock = new ControlledClock(T0);
  const codes = new InMemoryLoginCodeRepository();
  const email = new RecordingEmailProvider();
  const hasher = new HmacLoginCodeHasher(pepper);
  const service = new RequestLoginCodeService({
    clock,
    codes,
    email,
    generator: new RandomLoginCodeGenerator(),
    hasher,
    limits: { ...limits, ...overrides },
  });
  return { clock, codes, email, hasher, service };
}

describe("RequestLoginCodeService: sending a code", () => {
  it("stores only the HMAC of a six-digit code and emails the plaintext once", async () => {
    const { codes, email, hasher, service } = setup();

    const result = await service.execute({ email: "ada@example.io" });

    expect(result).toEqual({ kind: "sent" });
    const code = email.latestCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.to).toBe("ada@example.io");
    expect(codes.rows).toHaveLength(1);
    expect(codes.rows[0]?.code.codeHash).toBe(hasher.hash(code));
    expect(JSON.stringify(codes.rows)).not.toContain(code);
  });

  it("expires the code ten minutes after the single clock reading and says so in the email", async () => {
    const { codes, email, service } = setup();

    await service.execute({ email: "ada@example.io" });

    expect(codes.rows[0]?.code.expiresAt).toEqual(new Date("2030-01-01T10:10:00.000Z"));
    expect(codes.rows[0]?.code.createdAt).toEqual(T0);
    expect(email.sent[0]?.subject).toBeTruthy();
    expect(email.sent[0]?.text).toContain("10 minutes");
  });

  it("reads the clock once per request", async () => {
    const { clock, service } = setup();
    let reads = 0;
    const original = clock.now.bind(clock);
    clock.now = () => {
      reads += 1;
      return original();
    };

    await service.execute({ email: "ada@example.io" });

    expect(reads).toBe(1);
  });

  it("invalidates the earlier unused code when a new one is requested", async () => {
    const { clock, codes, service } = setup();
    await service.execute({ email: "ada@example.io" });
    clock.advance(61_000);

    await service.execute({ email: "ADA@example.io" });

    expect(codes.rows.map((row) => row.invalidatedAt !== null)).toEqual([true, false]);
    expect(await codes.findLatestValid("ada@example.io", await clock.now())).toBe(codes.rows[1]?.code);
  });

  it.each(["", "plain", "a@", "a b@x.io", "a@x"])("rejects the malformed email %j as a ValidationError and sends nothing", async (value) => {
    const { codes, email, service } = setup();

    await expect(service.execute({ email: value })).rejects.toBeInstanceOf(ValidationError);
    expect(email.sent).toHaveLength(0);
    expect(codes.rows).toHaveLength(0);
  });
});

describe("RequestLoginCodeService: rate limit", () => {
  it("blocks a second request within the cooldown and reports the seconds left", async () => {
    const { clock, email, service } = setup();
    await service.execute({ email: "ada@example.io" });
    clock.advance(20_000);

    const result = await service.execute({ email: "ada@example.io" });

    expect(result).toEqual({ kind: "rate_limited", retryAfterSeconds: 40 });
    expect(email.sent).toHaveLength(1);
  });

  it("rounds the wait up to a whole second and never reports less than 1", async () => {
    const { clock, service } = setup();
    await service.execute({ email: "ada@example.io" });
    clock.advance(59_500);
    expect(await service.execute({ email: "ada@example.io" })).toEqual({ kind: "rate_limited", retryAfterSeconds: 1 });

    clock.advance(499);
    expect(await service.execute({ email: "ada@example.io" })).toEqual({ kind: "rate_limited", retryAfterSeconds: 1 });
  });

  it("allows the request once the cooldown has passed", async () => {
    const { clock, service } = setup();
    await service.execute({ email: "ada@example.io" });
    clock.advance(60_000);

    expect(await service.execute({ email: "ada@example.io" })).toEqual({ kind: "sent" });
  });

  it("blocks the sixth request in the window until the oldest one leaves it", async () => {
    const { clock, codes, service } = setup();
    for (let i = 0; i < 5; i += 1) {
      expect(await service.execute({ email: "ada@example.io" })).toEqual({ kind: "sent" });
      clock.advance(120_000);
    }
    // 10 minutes after the first request; cooldown long over.
    const result = await service.execute({ email: "ada@example.io" });

    expect(result).toEqual({ kind: "rate_limited", retryAfterSeconds: 300 });
    expect(codes.rows).toHaveLength(5);
    clock.advance(300_000);
    expect(await service.execute({ email: "ada@example.io" })).toEqual({ kind: "sent" });
  });

});

describe("RequestLoginCodeService: rate limit scope", () => {
  it("answers an address that has no account exactly like one that has", async () => {
    const known = setup();
    const unknown = setup();
    await known.service.execute({ email: "known@example.io" });
    await unknown.service.execute({ email: "nobody@example.io" });
    known.clock.advance(20_000);
    unknown.clock.advance(20_000);

    expect(await known.service.execute({ email: "known@example.io" })).toEqual(await unknown.service.execute({ email: "nobody@example.io" }));
  });

  it("counts each email on its own", async () => {
    const { service } = setup();
    await service.execute({ email: "a@example.io" });

    expect(await service.execute({ email: "b@example.io" })).toEqual({ kind: "sent" });
  });

  it("uses the configured limits", async () => {
    const { clock, service } = setup({ limit: 1, cooldownSeconds: 5, windowMinutes: 2 });
    await service.execute({ email: "a@example.io" });
    clock.advance(10_000);

    expect(await service.execute({ email: "a@example.io" })).toEqual({ kind: "rate_limited", retryAfterSeconds: 110 });
  });
});

describe("RequestLoginCodeService: delivery failure", () => {
  it("surfaces an InfrastructureError that does not contain the code", async () => {
    const { codes, email, service } = setup();
    email.failure = deliveryFailure();

    const failure = await service.execute({ email: "ada@example.io" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(InfrastructureError);
    const stored = codes.rows[0]?.code.codeHash ?? "";
    expect(String(failure)).not.toContain(stored);
  });

  it("turns an unexpected provider error into an InfrastructureError without its message or cause", async () => {
    const { email, service } = setup();
    email.failure = new Error("smtp said: body was 123456 for ada@example.io");

    const failure = (await service.execute({ email: "ada@example.io" }).catch((error: unknown) => error)) as InfrastructureError;

    expect(failure).toBeInstanceOf(InfrastructureError);
    expect(failure.message).not.toContain("123456");
    expect(failure.cause).toBeUndefined();
  });
});
