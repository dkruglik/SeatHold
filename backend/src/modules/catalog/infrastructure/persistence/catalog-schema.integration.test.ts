import { describe, expect, it } from "vitest";
import {
  CHECK_VIOLATION,
  LATER,
  NOW,
  UNIQUE_VIOLATION,
  insertEventFixture,
  sqlErrorCode,
  useBookingDatabase,
} from "./catalog-test-support.js";

describe("seats constraints", () => {
  const prisma = useBookingDatabase();

  it("rejects a duplicate (event_id, row_label, seat_number)", async () => {
    const { eventId } = await insertEventFixture(prisma);

    const code = await sqlErrorCode(
      "INSERT INTO seats (event_id, row_label, seat_number, status) VALUES ($1, 'A', 1, 'available')",
      [eventId],
    );

    expect(code).toBe(UNIQUE_VIOLATION);
  });

  it("rejects a held seat without hold_id and held_until", async () => {
    const { eventId } = await insertEventFixture(prisma);

    const code = await sqlErrorCode(
      "INSERT INTO seats (event_id, row_label, seat_number, status) VALUES ($1, 'A', 2, 'held')",
      [eventId],
    );

    expect(code).toBe(CHECK_VIOLATION);
  });

  it("rejects an available seat that carries a hold_id", async () => {
    const { eventId, userId } = await insertEventFixture(prisma);
    const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
      INSERT INTO holds (event_id, user_id, expires_at, status, created_at)
      VALUES (${eventId}::uuid, ${userId}::uuid, ${LATER}, 'active', ${NOW}) RETURNING id`;

    const code = await sqlErrorCode(
      "INSERT INTO seats (event_id, row_label, seat_number, status, hold_id, held_until) VALUES ($1, 'A', 2, 'available', $2, $3)",
      [eventId, hold?.id, LATER],
    );

    expect(code).toBe(CHECK_VIOLATION);
  });

  it("accepts a held seat with hold_id and held_until", async () => {
    const { eventId, userId } = await insertEventFixture(prisma);
    const [hold] = await prisma.client.$queryRaw<{ id: string }[]>`
      INSERT INTO holds (event_id, user_id, expires_at, status, created_at)
      VALUES (${eventId}::uuid, ${userId}::uuid, ${LATER}, 'active', ${NOW}) RETURNING id`;

    const code = await sqlErrorCode(
      "INSERT INTO seats (event_id, row_label, seat_number, status, hold_id, held_until) VALUES ($1, 'A', 2, 'held', $2, $3)",
      [eventId, hold?.id, LATER],
    );

    expect(code).toBeNull();
  });

  it("rejects an unknown seat status", async () => {
    const { eventId } = await insertEventFixture(prisma);

    const code = await sqlErrorCode(
      "INSERT INTO seats (event_id, row_label, seat_number, status) VALUES ($1, 'A', 2, 'broken')",
      [eventId],
    );

    expect(code).toBe(CHECK_VIOLATION);
  });
});

describe("events and venues constraints", () => {
  const prisma = useBookingDatabase();

  it.each([
    ["more than 20000 seats", 200, 101, 5000],
    ["a negative price", 10, 20, -1],
    ["zero rows", 0, 20, 5000],
    ["more than 200 seats per row", 10, 201, 5000],
  ])("rejects an event with %s", async (_label, rows, perRow, price) => {
    const { eventId } = await insertEventFixture(prisma);

    const code = await sqlErrorCode(
      `INSERT INTO events (show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
       SELECT show_id, venue_id, starts_at, $2, 'EUR', $3, $4 FROM events WHERE id = $1`,
      [eventId, price, rows, perRow],
    );

    expect(code).toBe(CHECK_VIOLATION);
  });

  it("accepts the largest grid of 200 x 100 seats", async () => {
    const { eventId } = await insertEventFixture(prisma);

    const code = await sqlErrorCode(
      `INSERT INTO events (show_id, venue_id, starts_at, price_minor, currency, rows, seats_per_row)
       SELECT show_id, venue_id, starts_at, 0, 'EUR', 200, 100 FROM events WHERE id = $1`,
      [eventId],
    );

    expect(code).toBeNull();
  });

  it("keeps venue (name, city) unique", async () => {
    await insertEventFixture(prisma);

    const code = await sqlErrorCode(
      "INSERT INTO venues (name, city, country_code, timezone) VALUES ('Hall', 'Berlin', 'DE', 'Europe/Berlin')",
    );

    expect(code).toBe(UNIQUE_VIOLATION);
  });
});
