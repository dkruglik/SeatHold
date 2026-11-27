import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { PrismaGuestLinkRepository } from "./prisma-guest-link-repository.js";
import { insertGuestBooking, minutes, T0, useGuestAccessDatabase } from "./guest-access-test-support.js";

function setup() {
  const prisma = useGuestAccessDatabase();
  const links = new PrismaGuestLinkRepository(prisma);
  const issue = async (bookingId: string, tokenHash: string, ttlMinutes = 60, now = T0) =>
    links.create({ bookingId, tokenHash, expiresAt: minutes(now, ttlMinutes), now });
  return { prisma, links, issue };
}

const EXPIRES = minutes(T0, 600);
const consume = (links: PrismaGuestLinkRepository, tokenHash: string, now: Date, sessionTokenHash = `s-${tokenHash}`) =>
  links.consumeAndCreateSession({ tokenHash, sessionTokenHash, sessionExpiresAt: EXPIRES, now });
const sessionRows = (prisma: PrismaService) => prisma.client.guestSession.findMany();

describe("PrismaGuestLinkRepository: read usable", () => {
  const { prisma, links, issue } = setup();

  it("returns the booking id of a usable link without consuming it, and null for unknown, used, invalidated or expired ones", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "ok", 10);
    await issue(bookingId, "used");
    await consume(links, "used", minutes(T0, 1));
    const other = await insertGuestBooking(prisma);
    await issue(other, "invalidated");
    await links.invalidateUnusedForBookings([other], minutes(T0, 2));
    await issue(bookingId, "short", 5, minutes(T0, 3));

    expect(await links.findUsableBookingIdByTokenHash("ok", minutes(T0, 4))).toBe(bookingId);
    expect(await links.findUsableBookingIdByTokenHash("ok", minutes(T0, 4))).toBe(bookingId);
    expect(await links.findUsableBookingIdByTokenHash("nope", T0)).toBeNull();
    expect(await links.findUsableBookingIdByTokenHash("used", minutes(T0, 4))).toBeNull();
    expect(await links.findUsableBookingIdByTokenHash("invalidated", minutes(T0, 4))).toBeNull();
    expect(await links.findUsableBookingIdByTokenHash("short", minutes(T0, 8))).toBeNull();
    expect(await links.findStateByTokenHash("ok", minutes(T0, 4))).toBe("usable");
  });
});

describe("PrismaGuestLinkRepository: consume and create session", () => {
  const { prisma, links, issue } = setup();

  it("consumes an unused link once, creates its session in the same statement and returns the booking id", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "h1");

    expect(await consume(links, "h1", minutes(T0, 1))).toBe(bookingId);
    expect(await consume(links, "h1", minutes(T0, 2))).toBeNull();

    const sessions = await sessionRows(prisma);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ bookingId, tokenHash: "s-h1", expiresAt: EXPIRES, createdAt: minutes(T0, 1), revokedAt: null });
    expect(await links.findStateByTokenHash("h1", minutes(T0, 3))).toBe("used");
  });

  it("lets exactly one of 20 concurrent calls win and leaves exactly one session row", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "race");

    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => consume(links, "race", minutes(T0, 1), `s-race-${i}`)));

    expect(results.filter((r) => r !== null)).toEqual([bookingId]);
    expect(await sessionRows(prisma)).toHaveLength(1);
  });

  it("returns null and creates no session for an unknown, expired, consumed or invalidated link", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "expired", 10);
    await issue(bookingId, "invalidated");
    await links.invalidateUnusedForBookings([bookingId], minutes(T0, 1));
    await issue(bookingId, "edge", 10);

    expect(await consume(links, "nope", T0)).toBeNull();
    expect(await consume(links, "expired", minutes(T0, 10))).toBeNull();
    expect(await consume(links, "invalidated", minutes(T0, 2))).toBeNull();
    expect(await sessionRows(prisma)).toHaveLength(0);
    expect(await consume(links, "edge", minutes(T0, 9))).toBe(bookingId);
    expect(await sessionRows(prisma)).toHaveLength(1);
  });

  it("writes neither the consumption nor a session when the session insert fails (duplicate session token hash)", async () => {
    const bookingId = await insertGuestBooking(prisma);
    await issue(bookingId, "first");
    await issue(bookingId, "second");
    await consume(links, "first", minutes(T0, 1), "same-session-hash");

    await expect(consume(links, "second", minutes(T0, 2), "same-session-hash")).rejects.toThrow(/Persistence failed/);

    expect(await links.findStateByTokenHash("second", minutes(T0, 3))).toBe("usable");
    expect(await sessionRows(prisma)).toHaveLength(1);
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
    await consume(links, "used", minutes(T0, 1));
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
    await consume(links, "a-used", minutes(T0, 1));

    await links.invalidateUnusedForBookings([a], minutes(T0, 2));

    expect(await links.findStateByTokenHash("a-used", minutes(T0, 3))).toBe("used");
    expect(await links.findStateByTokenHash("a-open", minutes(T0, 3))).toBe("invalidated");
    expect(await links.findStateByTokenHash("b-open", minutes(T0, 3))).toBe("usable");
  });

  it("does nothing for an empty list of bookings", async () => {
    await expect(links.invalidateUnusedForBookings([], T0)).resolves.toBeUndefined();
  });
});
