import { describe, expect, it } from "vitest";
import { PrismaGuestResendLimiter } from "./prisma-guest-resend-limiter.js";
import { minutes, T0, useGuestAccessDatabase } from "./guest-access-test-support.js";

describe("PrismaGuestResendLimiter", () => {
  const prisma = useGuestAccessDatabase();
  const limiter = new PrismaGuestResendLimiter(prisma);

  it("admits `limit` registrations in the window, then refuses", async () => {
    expect(await limiter.tryRegister("e1", T0, 3, 60)).toBe(true);
    expect(await limiter.tryRegister("e1", minutes(T0, 1), 3, 60)).toBe(true);
    expect(await limiter.tryRegister("e1", minutes(T0, 2), 3, 60)).toBe(true);

    expect(await limiter.tryRegister("e1", minutes(T0, 3), 3, 60)).toBe(false);
  });

  it("counts each email hash on its own", async () => {
    await limiter.tryRegister("e1", T0, 1, 60);

    expect(await limiter.tryRegister("e1", T0, 1, 60)).toBe(false);
    expect(await limiter.tryRegister("e2", T0, 1, 60)).toBe(true);
  });

  it("admits again once the oldest attempt leaves the window", async () => {
    await limiter.tryRegister("e1", T0, 2, 60);
    await limiter.tryRegister("e1", minutes(T0, 30), 2, 60);
    expect(await limiter.tryRegister("e1", minutes(T0, 59), 2, 60)).toBe(false);

    expect(await limiter.tryRegister("e1", minutes(T0, 60), 2, 60)).toBe(true);
  });

  it("does not record a refused attempt", async () => {
    await limiter.tryRegister("e1", T0, 1, 60);
    await limiter.tryRegister("e1", minutes(T0, 1), 1, 60);

    const rows = await prisma.client.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM guest_resend_attempts`;
    expect(rows[0]?.n).toBe(1);
  });

  it("admits exactly `limit` of 20 concurrent calls", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => limiter.tryRegister("race", T0, 3, 60)));

    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
