import { describe, expect, it } from "vitest";
import { PrismaGuestLinkRepository } from "./prisma-guest-link-repository.js";
import { insertGuestBooking, minutes, T0, useGuestAccessDatabase } from "./guest-access-test-support.js";

function setup() {
  const prisma = useGuestAccessDatabase();
  const links = new PrismaGuestLinkRepository(prisma);
  const issue = async (bookingId: string, tokenHash: string, ttlMinutes = 60, now = T0) =>
    links.create({ bookingId, tokenHash, expiresAt: minutes(now, ttlMinutes), now });
  return { prisma, links, issue };
}

describe("PrismaGuestLinkRepository: consume", () => {
  const { prisma, links, issue } = setup();

  it("consumes an unused link once and returns its booking id", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "h1");

    expect(await links.consumeByTokenHash("h1", minutes(T0, 1))).toBe(bookingId);
    expect(await links.consumeByTokenHash("h1", minutes(T0, 2))).toBeNull();
  });

  it("lets exactly one of 20 concurrent consumes win", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "race");

    const results = await Promise.all(Array.from({ length: 20 }, () => links.consumeByTokenHash("race", minutes(T0, 1))));

    expect(results.filter((r) => r !== null)).toEqual([bookingId]);
  });

  it("does not consume an unknown, expired or invalidated link", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "expired", 10);
    await issue(bookingId, "invalidated");
    await links.invalidateUnusedForBookings([bookingId], minutes(T0, 1));
    await issue(bookingId, "edge", 10);

    expect(await links.consumeByTokenHash("nope", T0)).toBeNull();
    expect(await links.consumeByTokenHash("expired", minutes(T0, 10))).toBeNull();
    expect(await links.consumeByTokenHash("invalidated", minutes(T0, 2))).toBeNull();
    expect(await links.consumeByTokenHash("edge", minutes(T0, 9))).toBe(bookingId);
  });

  it("rejects a second link with the same token hash", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "dup");

    await expect(issue(bookingId, "dup")).rejects.toThrow(/Persistence failed: create guest link/);
  });
});

describe("PrismaGuestLinkRepository: state and invalidation", () => {
  const { prisma, links, issue } = setup();

  it("classifies unknown, usable, used, invalidated and expired links", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "usable", 60);
    await issue(bookingId, "used", 60);
    await issue(bookingId, "short", 5);
    await links.consumeByTokenHash("used", minutes(T0, 1));
    const other = await insertGuestBooking(prisma);
    await issue(other, "invalidated", 60);
    await links.invalidateUnusedForBookings([other], minutes(T0, 2));
    const at = minutes(T0, 10);

    expect(await links.findStateByTokenHash("missing", at)).toBe("unknown");
    expect(await links.findStateByTokenHash("usable", at)).toBe("usable");
    expect(await links.findStateByTokenHash("used", at)).toBe("used");
    expect(await links.findStateByTokenHash("invalidated", at)).toBe("invalidated");
    expect(await links.findStateByTokenHash("short", at)).toBe("expired");
  });

  it("invalidates unused links of the given bookings only and leaves consumed ones alone", async () => {
    const a = await insertGuestBooking(prisma);
    const b = await insertGuestBooking(prisma);
    await issue(a, "a-used");
    await issue(a, "a-open");
    await issue(b, "b-open");
    await links.consumeByTokenHash("a-used", minutes(T0, 1));

    await links.invalidateUnusedForBookings([a], minutes(T0, 2));

    expect(await links.findStateByTokenHash("a-used", minutes(T0, 3))).toBe("used");
    expect(await links.findStateByTokenHash("a-open", minutes(T0, 3))).toBe("invalidated");
    expect(await links.findStateByTokenHash("b-open", minutes(T0, 3))).toBe("usable");
  });

  it("does nothing for an empty list of bookings", async () => {
    await expect(links.invalidateUnusedForBookings([], T0)).resolves.toBeUndefined();
  });
});
