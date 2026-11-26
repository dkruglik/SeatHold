import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { HmacLoginCodeHasher } from "../infrastructure/crypto/hmac-login-code-hasher.js";
import { RandomLoginCodeGenerator } from "../infrastructure/crypto/random-login-code-generator.js";
import {
  InMemoryLoginCodeRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  RecordingEmailProvider,
  SequentialSessionTokens,
} from "./in-memory-auth-test-support.js";
import { LoginService } from "./login-service.js";
import { RequestLoginCodeService } from "./request-login-code-service.js";
import { SessionService } from "./session-service.js";
import { VerifyLoginCodeService } from "./verify-login-code-service.js";

const T0 = new Date("2030-01-01T10:00:00.000Z");

function setup() {
  const clock = new ControlledClock(T0);
  const codes = new InMemoryLoginCodeRepository();
  const users = new InMemoryUserRepository();
  const email = new RecordingEmailProvider();
  const hasher = new HmacLoginCodeHasher("unit-test-pepper-0123456789-abcdefghij");
  const request = new RequestLoginCodeService({
    clock,
    codes,
    email,
    generator: new RandomLoginCodeGenerator(),
    hasher,
    limits: { limit: 50, windowMinutes: 15, cooldownSeconds: 0 },
  });
  const sessions = new SessionService({ clock, sessions: new InMemorySessionRepository(users), tokens: new SequentialSessionTokens(), ttlDays: 30 });
  const login = new LoginService({ verify: new VerifyLoginCodeService({ clock, codes, hasher, users }), sessions });
  const codeFor = async (address: string): Promise<string> => {
    await request.execute({ email: address });
    return email.latestCode();
  };
  return { sessions, login, codeFor };
}

describe("LoginService", () => {
  it("starts a session for the verified user and returns the raw token", async () => {
    const { sessions, login, codeFor } = setup();

    const result = await login.execute({ email: "ada@example.io", code: await codeFor("ada@example.io") });

    expect(result.kind).toBe("logged_in");
    if (result.kind === "logged_in") {
      expect(result.user.email).toBe("ada@example.io");
      expect((await sessions.authenticate(result.token))?.user.id).toBe(result.user.id);
    }
  });

  it("starts no session for a wrong code", async () => {
    const { login, codeFor } = setup();
    const code = await codeFor("ada@example.io");

    const result = await login.execute({ email: "ada@example.io", code: code === "000000" ? "000001" : "000000" });

    expect(result).toEqual({ kind: "invalid_code" });
  });

  it("rotates: a new token every login, and a presented live token is revoked", async () => {
    const { sessions, login, codeFor } = setup();
    const first = await login.execute({ email: "ada@example.io", code: await codeFor("ada@example.io") });
    if (first.kind !== "logged_in") throw new Error("first login failed");

    const second = await login.execute({ email: "ada@example.io", code: await codeFor("ada@example.io"), presentedToken: first.token });

    if (second.kind !== "logged_in") throw new Error("second login failed");
    expect(second.token).not.toBe(first.token);
    expect(await sessions.authenticate(first.token)).toBeNull();
    expect(await sessions.authenticate(second.token)).not.toBeNull();
  });

  it("keeps a presented token alive when the code is wrong", async () => {
    const { sessions, login, codeFor } = setup();
    const first = await login.execute({ email: "ada@example.io", code: await codeFor("ada@example.io") });
    if (first.kind !== "logged_in") throw new Error("first login failed");

    await login.execute({ email: "ada@example.io", code: "not-a-code", presentedToken: first.token });

    expect(await sessions.authenticate(first.token)).not.toBeNull();
  });
});
