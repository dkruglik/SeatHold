import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/errors/app-error.js";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { HmacLoginCodeHasher } from "../infrastructure/crypto/hmac-login-code-hasher.js";
import { RandomLoginCodeGenerator } from "../infrastructure/crypto/random-login-code-generator.js";
import type { LoginCodeGenerator } from "./ports/login-code-generator.js";
import { InMemoryLoginCodeRepository, InMemoryUserRepository, RecordingEmailProvider } from "./in-memory-auth-test-support.js";
import { RequestLoginCodeService } from "./request-login-code-service.js";
import { VerifyLoginCodeService } from "./verify-login-code-service.js";

const T0 = new Date("2030-01-01T10:00:00.000Z");
const pepper = "unit-test-pepper-0123456789-abcdefghij";

function setup(generator: LoginCodeGenerator = new RandomLoginCodeGenerator()) {
  const clock = new ControlledClock(T0);
  const codes = new InMemoryLoginCodeRepository();
  const users = new InMemoryUserRepository();
  const email = new RecordingEmailProvider();
  const hasher = new HmacLoginCodeHasher(pepper);
  const request = new RequestLoginCodeService({
    clock,
    codes,
    email,
    generator,
    hasher,
    limits: { limit: 5, windowMinutes: 15, cooldownSeconds: 60 },
  });
  const verify = new VerifyLoginCodeService({ clock, codes, hasher, users });
  const wrongCode = (): string => (email.latestCode() === "000000" ? "000001" : "000000");
  return { clock, codes, users, email, request, verify, wrongCode };
}

describe("VerifyLoginCodeService: the right code", () => {
  it("verifies into a new buyer for an unknown email", async () => {
    const { codes, users, email, request, verify } = setup();
    await request.execute({ email: "new@example.io" });

    const result = await verify.execute({ email: "new@example.io", code: email.latestCode() });

    expect(result.kind).toBe("verified");
    expect(result.kind === "verified" && result.user).toMatchObject({ email: "new@example.io", role: "buyer" });
    expect(users.users).toHaveLength(1);
    expect(codes.rows[0]?.consumedAt).toEqual(T0);
  });

  it("verifies an existing user as that same user without touching the role", async () => {
    const { users, email, request, verify } = setup();
    await users.createBuyer("boss@example.io", T0);
    await users.setRoleByEmail("boss@example.io", "admin");
    const before = await users.findByEmail("boss@example.io");
    await request.execute({ email: "BOSS@example.io" });

    const result = await verify.execute({ email: "boss@example.io", code: email.latestCode() });

    expect(result.kind === "verified" && result.user.id).toBe(before?.id);
    expect(result.kind === "verified" && result.user.role).toBe("admin");
    expect(users.users).toHaveLength(1);
  });

  it("takes the email only from its input: the result carries no role chosen by the caller", async () => {
    const { email, request, verify } = setup();
    await request.execute({ email: "new@example.io" });

    const result = await verify.execute({ email: "new@example.io", code: email.latestCode(), role: "admin" } as never);

    expect(result.kind === "verified" && result.user.role).toBe("buyer");
  });

});

describe("VerifyLoginCodeService: lifetime of a code", () => {
  it("reads the clock once per verification", async () => {
    const { clock, email, request, verify } = setup();
    await request.execute({ email: "new@example.io" });
    const code = email.latestCode();
    let reads = 0;
    const original = clock.now.bind(clock);
    clock.now = () => {
      reads += 1;
      return original();
    };

    await verify.execute({ email: "new@example.io", code });

    expect(reads).toBe(1);
  });

  it("accepts the code while it is valid and rejects it once ten minutes have passed", async () => {
    const { clock, email, request, verify } = setup();
    await request.execute({ email: "a@example.io" });
    const code = email.latestCode();
    clock.advance(10 * 60_000 - 1);
    expect((await verify.execute({ email: "a@example.io", code })).kind).toBe("verified");

    await request.execute({ email: "b@example.io" });
    const second = email.latestCode();
    clock.advance(10 * 60_000);
    expect(await verify.execute({ email: "b@example.io", code: second })).toEqual({ kind: "invalid_code" });
  });

  it("cannot be used twice", async () => {
    const { email, request, verify } = setup();
    await request.execute({ email: "a@example.io" });
    const code = email.latestCode();

    expect((await verify.execute({ email: "a@example.io", code })).kind).toBe("verified");
    expect(await verify.execute({ email: "a@example.io", code })).toEqual({ kind: "invalid_code" });
  });

  it("answers invalid_code when a concurrent verify consumed the code first", async () => {
    const { codes, email, request, verify } = setup();
    await request.execute({ email: "a@example.io" });
    const code = email.latestCode();
    codes.consume = () => Promise.resolve(false);

    expect(await verify.execute({ email: "a@example.io", code })).toEqual({ kind: "invalid_code" });
  });

  it("does not create a user when the code is wrong", async () => {
    const { users, email, request, verify, wrongCode } = setup();
    await request.execute({ email: "a@example.io" });

    await verify.execute({ email: "a@example.io", code: wrongCode() });

    expect(email.sent).toHaveLength(1);
    expect(users.users).toHaveLength(0);
  });
});

describe("VerifyLoginCodeService: wrong codes", () => {
  it("answers invalid_code and counts the attempt", async () => {
    const { codes, request, verify, wrongCode } = setup();
    await request.execute({ email: "a@example.io" });

    expect(await verify.execute({ email: "a@example.io", code: wrongCode() })).toEqual({ kind: "invalid_code" });
    expect(codes.rows[0]?.code.attempts).toBe(1);
  });

  it("kills the code at the fifth wrong attempt, so the right code fails afterwards", async () => {
    const { email, request, verify, wrongCode } = setup();
    await request.execute({ email: "a@example.io" });
    const right = email.latestCode();
    for (let i = 0; i < 5; i += 1) {
      expect(await verify.execute({ email: "a@example.io", code: wrongCode() })).toEqual({ kind: "invalid_code" });
    }

    expect(await verify.execute({ email: "a@example.io", code: right })).toEqual({ kind: "invalid_code" });
  });

  it("still accepts the right code after four wrong attempts", async () => {
    const { email, request, verify, wrongCode } = setup();
    await request.execute({ email: "a@example.io" });
    for (let i = 0; i < 4; i += 1) {
      await verify.execute({ email: "a@example.io", code: wrongCode() });
    }

    expect((await verify.execute({ email: "a@example.io", code: email.latestCode() })).kind).toBe("verified");
  });

  it("gives the same result for an email that never asked for a code", async () => {
    const { users, verify } = setup();

    expect(await verify.execute({ email: "ghost@example.io", code: "123456" })).toEqual({ kind: "invalid_code" });
    expect(users.users).toHaveLength(0);
  });

  it("only the newest code counts after a new request", async () => {
    const codesToIssue = ["111111", "222222"];
    const { clock, email, request, verify } = setup({ generate: () => codesToIssue.shift() ?? "" });
    await request.execute({ email: "a@example.io" });
    const first = email.latestCode();
    clock.advance(61_000);
    await request.execute({ email: "a@example.io" });
    const second = email.latestCode();

    expect(await verify.execute({ email: "a@example.io", code: first })).toEqual({ kind: "invalid_code" });
    expect((await verify.execute({ email: "a@example.io", code: second })).kind).toBe("verified");
  });

  it("rejects a malformed email as a ValidationError", async () => {
    const { verify } = setup();

    await expect(verify.execute({ email: "not-an-email", code: "123456" })).rejects.toBeInstanceOf(ValidationError);
  });
});
