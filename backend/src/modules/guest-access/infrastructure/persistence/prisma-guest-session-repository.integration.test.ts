import { describe, expect, it } from "vitest";
import { PrismaGuestSessionRepository } from "./prisma-guest-session-repository.js";
import { insertGuestBooking, minutes, T0, useGuestAccessDatabase } from "./guest-access-test-support.js";

describe("PrismaGuestSessionRepository", () => {
  const prisma = useGuestAccessDatabase();
  const sessions = new PrismaGuestSessionRepository(prisma);
  const open = (bookingId: string, tokenHash: string, ttlMinutes = 60) =>
    sessions.create({ bookingId, tokenHash, expiresAt: minutes(T0, ttlMinutes), now: T0 });

  it("stores a session and finds it active by token hash", async () => {
    const bookingId = await insertGuestBooking(prisma);
    const created = await open(bookingId, "s1");

    const found = await sessions.findActiveByTokenHash("s1", minutes(T0, 1));

    expect(found).toEqual(created);
    expect(found?.bookingId).toBe(bookingId);
    expect(found?.expiresAt).toEqual(minutes(T0, 60));
  });

  it("does not find unknown or expired sessions", async () => {
    await open(await insertGuestBooking(prisma), "s1", 10);

    expect(await sessions.findActiveByTokenHash("nope", T0)).toBeNull();
    expect(await sessions.findActiveByTokenHash("s1", minutes(T0, 9))).not.toBeNull();
    expect(await sessions.findActiveByTokenHash("s1", minutes(T0, 10))).toBeNull();
  });

  it("revokes the sessions of the given bookings only", async () => {
    const a = await insertGuestBooking(prisma);
    const b = await insertGuestBooking(prisma);
    await open(a, "a1");
    await open(a, "a2");
    await open(b, "b1");

    await sessions.revokeForBookings([a], minutes(T0, 1));

    expect(await sessions.findActiveByTokenHash("a1", minutes(T0, 2))).toBeNull();
    expect(await sessions.findActiveByTokenHash("a2", minutes(T0, 2))).toBeNull();
    expect(await sessions.findActiveByTokenHash("b1", minutes(T0, 2))).not.toBeNull();
    await expect(sessions.revokeForBookings([], T0)).resolves.toBeUndefined();
  });

  it("keeps the first revocation time on a second revoke", async () => {
    const a = await insertGuestBooking(prisma);
    await open(a, "a1");
    await sessions.revokeForBookings([a], minutes(T0, 1));
    await sessions.revokeForBookings([a], minutes(T0, 5));

    const rows = await prisma.client.$queryRaw<{ revoked_at: Date }[]>`SELECT revoked_at FROM guest_sessions`;
    expect(rows[0]?.revoked_at).toEqual(minutes(T0, 1));
  });

  it("rejects a second session with the same token hash", async () => {
    const a = await insertGuestBooking(prisma);
    await open(a, "dup");

    await expect(open(a, "dup")).rejects.toThrow(/Persistence failed: create guest session/);
  });
});
