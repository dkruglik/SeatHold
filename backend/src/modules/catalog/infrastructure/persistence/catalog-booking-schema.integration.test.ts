import { describe, expect, it } from "vitest";
import {
  CHECK_VIOLATION,
  LATER,
  NOW,
  UNIQUE_VIOLATION,
  insertEventFixture,
  insertHoldFixture,
  sqlErrorCode,
  useBookingDatabase,
} from "./catalog-test-support.js";

const insertHold = (
  eventId: string,
  userId: string | null,
  visitorHash: string | null,
  status: string,
) =>
  sqlErrorCode(
    "INSERT INTO holds (event_id, user_id, visitor_hash, expires_at, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [eventId, userId, visitorHash, LATER, status, NOW],
  );

const insertBooking = (
  eventId: string,
  holdId: string,
  status: string,
  userId: string | null,
  guestEmail: string | null,
) =>
  sqlErrorCode(
    `INSERT INTO bookings (hold_id, event_id, user_id, guest_email, status, unit_price_minor, total_minor, currency, created_at)
     VALUES ($1, $2, $3, $4, $5, 5000, 5000, 'EUR', $6)`,
    [holdId, eventId, userId, guestEmail, status, NOW],
  );

describe("holds constraints", () => {
  const prisma = useBookingDatabase();

  it("rejects a hold with both user_id and visitor_hash", async () => {
    const { eventId, userId } = await insertEventFixture(prisma);

    expect(await insertHold(eventId, userId, "v1", "active")).toBe(
      CHECK_VIOLATION,
    );
  });

  it("rejects a hold with neither user_id nor visitor_hash", async () => {
    const { eventId } = await insertEventFixture(prisma);

    expect(await insertHold(eventId, null, null, "active")).toBe(
      CHECK_VIOLATION,
    );
  });

  it("rejects an unknown hold status", async () => {
    const { eventId } = await insertEventFixture(prisma);

    expect(await insertHold(eventId, null, "v1", "pending")).toBe(
      CHECK_VIOLATION,
    );
  });

  it("rejects two active holds for the same (event, visitor_hash)", async () => {
    const { eventId } = await insertEventFixture(prisma);
    expect(await insertHold(eventId, null, "v1", "active")).toBeNull();

    expect(await insertHold(eventId, null, "v1", "active")).toBe(
      UNIQUE_VIOLATION,
    );
  });

  it("rejects two active holds for the same (event, user_id)", async () => {
    const { eventId, userId } = await insertEventFixture(prisma);
    expect(await insertHold(eventId, userId, null, "active")).toBeNull();

    expect(await insertHold(eventId, userId, null, "active")).toBe(
      UNIQUE_VIOLATION,
    );
  });

  it("allows expired and released holds beside one active hold of the same visitor", async () => {
    const { eventId } = await insertEventFixture(prisma);
    expect(await insertHold(eventId, null, "v1", "expired")).toBeNull();
    expect(await insertHold(eventId, null, "v1", "released")).toBeNull();

    expect(await insertHold(eventId, null, "v1", "active")).toBeNull();
  });
});

describe("bookings, tickets and payments constraints", () => {
  const prisma = useBookingDatabase();

  const holdAndBooking = () => insertHoldFixture(prisma);

  it("rejects a confirmed booking with neither user nor guest_email", async () => {
    const { eventId, holdId } = await holdAndBooking();

    expect(await insertBooking(eventId, holdId, "confirmed", null, null)).toBe(
      CHECK_VIOLATION,
    );
  });

  it("rejects a confirmed booking with both user and guest_email", async () => {
    const { eventId, holdId, userId } = await holdAndBooking();

    expect(
      await insertBooking(eventId, holdId, "confirmed", userId, "g@x.io"),
    ).toBe(CHECK_VIOLATION);
  });

  it("accepts a rejected booking without a buyer", async () => {
    const { eventId, holdId } = await holdAndBooking();

    expect(
      await insertBooking(eventId, holdId, "rejected", null, null),
    ).toBeNull();
  });

  it("accepts a confirmed guest booking", async () => {
    const { eventId, holdId } = await holdAndBooking();

    expect(
      await insertBooking(eventId, holdId, "confirmed", null, "g@x.io"),
    ).toBeNull();
  });

  it("rejects an unknown booking status", async () => {
    const { eventId, holdId } = await holdAndBooking();

    expect(
      await insertBooking(eventId, holdId, "pending", null, "g@x.io"),
    ).toBe(CHECK_VIOLATION);
  });
});

describe("bookings uniqueness", () => {
  const prisma = useBookingDatabase();
  const holdAndBooking = () => insertHoldFixture(prisma);

  it("rejects a second booking for the same hold_id", async () => {
    const { eventId, holdId } = await holdAndBooking();
    expect(
      await insertBooking(eventId, holdId, "confirmed", null, "g@x.io"),
    ).toBeNull();

    expect(await insertBooking(eventId, holdId, "rejected", null, null)).toBe(
      UNIQUE_VIOLATION,
    );
  });
});

describe("tickets and payments constraints", () => {
  const prisma = useBookingDatabase();

  const holdAndBooking = () => insertHoldFixture(prisma);

  it("rejects a second ticket for the same seat and a duplicate ticket code", async () => {
    const { eventId, holdId, seatId } = await holdAndBooking();
    const [booking] = await prisma.client.$queryRaw<{ id: string }[]>`
      INSERT INTO bookings (hold_id, event_id, guest_email, status, unit_price_minor, total_minor, currency, created_at)
      VALUES (${holdId}::uuid, ${eventId}::uuid, 'g@x.io', 'confirmed', 5000, 5000, 'EUR', ${NOW}) RETURNING id`;
    const [seat2] = await prisma.client.$queryRaw<{ id: string }[]>`
      INSERT INTO seats (event_id, row_label, seat_number, status) VALUES (${eventId}::uuid, 'A', 2, 'available') RETURNING id`;
    const insertTicket = (seat: string | undefined, code: string) =>
      sqlErrorCode(
        "INSERT INTO tickets (booking_id, seat_id, code, created_at) VALUES ($1, $2, $3, $4)",
        [booking?.id, seat, code, NOW],
      );
    expect(await insertTicket(seatId, "code-1")).toBeNull();

    expect(await insertTicket(seatId, "code-2")).toBe(UNIQUE_VIOLATION);
    expect(await insertTicket(seat2?.id, "code-1")).toBe(UNIQUE_VIOLATION);
    expect(await insertTicket(seat2?.id, "code-3")).toBeNull();
  });

  it("rejects a duplicate payment idempotency_key and an unknown outcome", async () => {
    const { holdId } = await holdAndBooking();
    const insertPayment = (key: string, outcome: string) =>
      sqlErrorCode(
        "INSERT INTO payments (hold_id, idempotency_key, amount_minor, outcome, created_at) VALUES ($1, $2, 5000, $3, $4)",
        [holdId, key, outcome, NOW],
      );
    expect(await insertPayment("k1", "succeeded")).toBeNull();

    expect(await insertPayment("k1", "failed")).toBe(UNIQUE_VIOLATION);
    expect(await insertPayment("k2", "refunded")).toBe(CHECK_VIOLATION);
  });
});
