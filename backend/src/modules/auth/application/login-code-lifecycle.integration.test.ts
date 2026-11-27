import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { ConsoleEmailProvider } from "../infrastructure/email/console-email-provider.js";
import { HmacLoginCodeHasher } from "../infrastructure/crypto/hmac-login-code-hasher.js";
import { RandomLoginCodeGenerator } from "../infrastructure/crypto/random-login-code-generator.js";
import { useAuthDatabase } from "../infrastructure/persistence/auth-test-support.js";
import { PrismaLoginCodeRepository } from "../infrastructure/persistence/prisma-login-code-repository.js";
import { PrismaUserRepository } from "../infrastructure/persistence/prisma-user-repository.js";
import { RequestLoginCodeService } from "./request-login-code-service.js";
import { VerifyLoginCodeService } from "./verify-login-code-service.js";

const T0 = new Date("2030-01-01T10:00:00.000Z");
const pepper = "integration-pepper-0123456789-abcdefgh";

function setup() {
  const prisma = useAuthDatabase();
  const clock = new ControlledClock(T0);
  const codes = new PrismaLoginCodeRepository(prisma);
  const users = new PrismaUserRepository(prisma);
  const hasher = new HmacLoginCodeHasher(pepper);
  const lines: string[] = [];
  const request = new RequestLoginCodeService({
    clock,
    codes,
    email: new ConsoleEmailProvider((line) => lines.push(line)),
    generator: new RandomLoginCodeGenerator(),
    hasher,
    limits: { limit: 5, windowMinutes: 15, cooldownSeconds: 60 },
  });
  const verify = new VerifyLoginCodeService({ clock, codes, hasher, users });
  const sentCode = (): string => /\b(\d{6})\b/.exec(lines.at(-1) ?? "")?.[1] ?? "";
  return { prisma, clock, users, request, verify, sentCode };
}

describe("login code lifecycle against PostgreSQL", () => {
  const { prisma, users, request, verify, sentCode } = setup();

  it("requests a code, stores only its hash, verifies it and creates the buyer", async () => {
    expect(await request.execute({ email: "Ada@Example.io" })).toEqual({ kind: "sent" });
    const code = sentCode();
    const rows = await prisma.client.authCode.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(code);

    const result = await verify.execute({ email: "ada@example.io", code });

    expect(result.kind).toBe("verified");
    expect((await users.findByEmail("ada@example.io"))?.role).toBe("buyer");
    expect(await verify.execute({ email: "ada@example.io", code })).toEqual({ kind: "invalid_code" });
  });

  it("limits requests from the database rows and reports the wait", async () => {
    await request.execute({ email: "ada@example.io" });

    expect(await request.execute({ email: "ada@example.io" })).toEqual({ kind: "rate_limited", retryAfterSeconds: 60 });
  });

  it("lets exactly one of two concurrent verifies of the same correct code win", async () => {
    await request.execute({ email: "race@example.io" });
    const code = sentCode();

    const results = await Promise.all([
      verify.execute({ email: "race@example.io", code }),
      verify.execute({ email: "race@example.io", code }),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["invalid_code", "verified"]);
    expect(await prisma.client.user.count({ where: { email: "race@example.io" } })).toBe(1);
  });
});
