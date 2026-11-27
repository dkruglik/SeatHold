import { describe, expect, it } from "vitest";
import { PrismaGuestResendLimiter } from "./prisma-guest-resend-limiter.js";
import { minutes, T0, useGuestAccessDatabase } from "./guest-access-test-support.js";

describe("PrismaGuestResendLimiter", () => {
  const prisma = useGuestAccessDatabase();
  const limiter = new PrismaGuestResendLimiter(prisma);

  it("admits `limit` registrations in the window, then refuses", async () => {
    expect(await limiter.tryRegister("e1", T0, 3, 60)).toEqual({ allowed: true });
    expect(await limiter.tryRegister("e1", minutes(T0, 1), 3, 60)).toEqual({ allowed: true });
    expect(await limiter.tryRegister("e1", minutes(T0, 2), 3, 60)).toEqual({ allowed: true });

    expect(await limiter.tryRegister("e1", minutes(T0, 3), 3, 60)).toEqual({ allowed: false, retryAfterSeconds: 57 * 60 });
  });

  it("counts each email hash on its own", async () => {
    await limiter.tryRegister("e1", T0, 1, 60);

    expect(await limiter.tryRegister("e1", T0, 1, 60)).toEqual({ allowed: false, retryAfterSeconds: 3600 });
    expect(await limiter.tryRegister("e2", T0, 1, 60)).toEqual({ allowed: true });
  });

  it("admits again once the oldest attempt leaves the window", async () => {
    await limiter.tryRegister("e1", T0, 2, 60);
    await limiter.tryRegister("e1", minutes(T0, 30), 2, 60);
    expect(await limiter.tryRegister("e1", minutes(T0, 59), 2, 60)).toEqual({ allowed: false, retryAfterSeconds: 60 });

    expect(await limiter.tryRegister("e1", minutes(T0, 60), 2, 60)).toEqual({ allowed: true });
  });

  it("refuses the 4th attempt with the seconds until the oldest attempt leaves the window, then admits again", async () => {
    for (const m of [0, 1, 2]) await limiter.tryRegister("e1", minutes(T0, m), 3, 60);

    expect(await limiter.tryRegister("e1", minutes(T0, 10), 3, 60)).toEqual({ allowed: false, retryAfterSeconds: 3000 });
    expect(await limiter.tryRegister("e1", new Date(minutes(T0, 60).getTime() - 500), 3, 60)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(await limiter.tryRegister("e1", minutes(T0, 60), 3, 60)).toEqual({ allowed: true });
  });

  it("does not record a refused attempt", async () => {
    await limiter.tryRegister("e1", T0, 1, 60);
    await limiter.tryRegister("e1", minutes(T0, 1), 1, 60);

    const rows = await prisma.client.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM guest_resend_attempts`;
    expect(rows[0]?.n).toBe(1);
  });

  it("admits exactly `limit` of 20 concurrent calls", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => limiter.tryRegister("race", T0, 3, 60)));

    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });
});
