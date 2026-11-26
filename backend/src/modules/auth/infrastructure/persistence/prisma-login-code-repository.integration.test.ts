import { describe, expect, it } from "vitest";
import { useAuthDatabase } from "./auth-test-support.js";
import { PrismaLoginCodeRepository } from "./prisma-login-code-repository.js";

const T0 = new Date("2026-01-01T12:00:00Z");
const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);

function setup() {
  const prisma = useAuthDatabase();
  const codes = new PrismaLoginCodeRepository(prisma);
  const issue = (email: string, now: Date, ttlMinutes = 10) =>
    codes.create({ email, codeHash: `hash-${email}-${now.getTime()}`, expiresAt: minutes(now, ttlMinutes), now });
  return { prisma, codes, issue };
}

describe("PrismaLoginCodeRepository: reading codes", () => {
  const { codes, issue } = setup();

  it("stores a code with zero attempts and finds it as the latest valid one", async () => {
    const created = await issue("a@x.io", T0);

    const found = await codes.findLatestValid("A@X.io", minutes(T0, 1));

    expect(found).toEqual(created);
    expect(found?.attempts).toBe(0);
    expect(found?.expiresAt).toEqual(minutes(T0, 10));
  });

  it("returns the most recent valid code", async () => {
    await issue("a@x.io", T0);
    const newer = await issue("a@x.io", minutes(T0, 2));

    expect((await codes.findLatestValid("a@x.io", minutes(T0, 3)))?.id).toBe(newer.id);
  });

  it("ignores expired codes", async () => {
    await issue("a@x.io", T0);

    expect(await codes.findLatestValid("a@x.io", minutes(T0, 10))).toBeNull();
    expect(await codes.findLatestValid("a@x.io", minutes(T0, 9))).not.toBeNull();
  });

  it("ignores consumed and invalidated codes", async () => {
    const consumed = await issue("a@x.io", T0);
    await codes.consume(consumed.id, minutes(T0, 1));
    expect(await codes.findLatestValid("a@x.io", minutes(T0, 2))).toBeNull();

    await issue("a@x.io", minutes(T0, 3));
    await codes.invalidateUnused("a@x.io", minutes(T0, 4));
    expect(await codes.findLatestValid("a@x.io", minutes(T0, 5))).toBeNull();
  });

});

describe("PrismaLoginCodeRepository: changing codes", () => {
  const { prisma, codes, issue } = setup();

  it("increments attempts and returns the new count each time", async () => {
    const { id } = await issue("a@x.io", T0);

    expect(await codes.incrementAttempts(id)).toBe(1);
    expect(await codes.incrementAttempts(id)).toBe(2);
    expect(await codes.incrementAttempts(id)).toBe(3);
    expect((await codes.findLatestValid("a@x.io", minutes(T0, 1)))?.attempts).toBe(3);
  });

  it("consumes a code once, and not after expiry", async () => {
    const { id } = await issue("a@x.io", T0);
    expect(await codes.consume(id, minutes(T0, 10))).toBe(false);

    expect(await codes.consume(id, minutes(T0, 5))).toBe(true);
    expect(await codes.consume(id, minutes(T0, 5))).toBe(false);
  });

  it("lets exactly one of two concurrent consume calls win", async () => {
    const { id } = await issue("a@x.io", T0);

    const results = await Promise.all([codes.consume(id, minutes(T0, 1)), codes.consume(id, minutes(T0, 1))]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("invalidates only the unconsumed codes of that email", async () => {
    const consumed = await issue("a@x.io", T0);
    await codes.consume(consumed.id, minutes(T0, 1));
    await issue("a@x.io", minutes(T0, 2));
    const other = await issue("b@x.io", minutes(T0, 2));

    await codes.invalidateUnused("A@x.io", minutes(T0, 3));

    expect(await codes.findLatestValid("a@x.io", minutes(T0, 4))).toBeNull();
    expect((await codes.findLatestValid("b@x.io", minutes(T0, 4)))?.id).toBe(other.id);
    const rows = await prisma.client.$queryRaw<{ invalidated: number; consumed_invalidated: number }[]>`
      SELECT count(*) FILTER (WHERE invalidated_at IS NOT NULL)::int AS invalidated,
             count(*) FILTER (WHERE invalidated_at IS NOT NULL AND consumed_at IS NOT NULL)::int AS consumed_invalidated
      FROM auth_codes`;
    expect(rows[0]).toEqual({ invalidated: 1, consumed_invalidated: 0 });
  });

  it("counts requests of one email since a point in time", async () => {
    await issue("a@x.io", T0);
    await issue("A@x.io", minutes(T0, 5));
    await issue("a@x.io", minutes(T0, 20));
    await issue("b@x.io", minutes(T0, 20));

    expect(await codes.countRequestsSince("a@x.io", minutes(T0, 5))).toBe(2);
    expect(await codes.countRequestsSince("a@x.io", minutes(T0, 30))).toBe(0);
  });

  it("reports the latest creation time of an email, or null", async () => {
    expect(await codes.latestCreatedAt("a@x.io")).toBeNull();
    await issue("a@x.io", T0);
    await issue("a@x.io", minutes(T0, 5));

    expect(await codes.latestCreatedAt("A@x.io")).toEqual(minutes(T0, 5));
  });
});
