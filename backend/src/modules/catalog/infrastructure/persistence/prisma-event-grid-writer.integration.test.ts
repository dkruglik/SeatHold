import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../../../shared/errors/app-error.js";
import type { NewEventGrid } from "../../application/ports/event-grid-writer.js";
import { PrismaEventGridWriter } from "./prisma-event-grid-writer.js";
import { useBookingDatabase } from "./catalog-test-support.js";

const GRID_SHOW = { title: "Hamlet", type: "theatre", genre: "drama", description: "A play" };
const GRID: NewEventGrid = {
  show: { new: GRID_SHOW },
  venue: { new: { name: "Globe", city: "London", countryCode: "GB", timezone: "Europe/London" } },
  startsAt: new Date("2030-06-01T18:00:00.000Z"),
  priceMinor: 5000,
  currency: "EUR",
  rows: 3,
  seatsPerRow: 4,
};

const prisma = useBookingDatabase();
const writer = new PrismaEventGridWriter(prisma);
const count = async (table: "shows" | "venues" | "events" | "seats"): Promise<number> => {
  const [row] = await prisma.client.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${table}`);
  return row?.n ?? 0;
};

describe("PrismaEventGridWriter grid", () => {
  it("creates the event and exactly rows x seatsPerRow available seats, numbered from 1", async () => {
    const created = await writer.create(GRID);

    expect(created).toMatchObject({ title: "Hamlet", priceMinor: 5000, currency: "EUR", rows: 3, seatsPerRow: 4, seatCount: 12 });
    const seats = await prisma.client.$queryRaw<{ row_label: string; n: number; status: string; hold_id: string | null; held_until: Date | null }[]>`
      SELECT row_label, seat_number AS n, status, hold_id, held_until FROM seats WHERE event_id = ${created.eventId}::uuid ORDER BY row_label, seat_number`;
    expect(seats).toHaveLength(12);
    expect(seats.every((s) => s.status === "available" && s.hold_id === null && s.held_until === null)).toBe(true);
    expect([...new Set(seats.map((s) => s.row_label))]).toEqual(["A", "B", "C"]);
    expect(seats.filter((s) => s.row_label === "B").map((s) => s.n)).toEqual([1, 2, 3, 4]);
  });

  it("labels the row after Z as AA", async () => {
    const created = await writer.create({ ...GRID, rows: 28, seatsPerRow: 1 });

    const labels = await prisma.client.$queryRaw<{ row_label: string }[]>`SELECT row_label FROM seats WHERE event_id = ${created.eventId}::uuid ORDER BY length(row_label), row_label`;
    expect(labels.map((l) => l.row_label).slice(24)).toEqual(["Y", "Z", "AA", "AB"]);
  });

  it("creates a 100 x 200 grid of 20,000 seats in one transaction, fast", async () => {
    const started = performance.now();
    const created = await writer.create({ ...GRID, rows: 100, seatsPerRow: 200 });
    const elapsed = performance.now() - started;

    expect(created.seatCount).toBe(20_000);
    expect(await count("seats")).toBe(20_000);
    console.log(`20,000-seat grid created in ${Math.round(elapsed)} ms`);
    expect(elapsed).toBeLessThan(5000);
  });

});

describe("PrismaEventGridWriter show and venue", () => {
  it("reuses an existing show and venue", async () => {
    const first = await writer.create(GRID);

    const second = await writer.create({ ...GRID, show: { existingId: first.showId }, venue: { existingId: first.venueId } });

    expect([second.showId, second.venueId]).toEqual([first.showId, first.venueId]);
    expect([await count("shows"), await count("venues"), await count("events")]).toEqual([1, 1, 2]);
  });

  it("reuses a venue whose (name, city, country, timezone) all match", async () => {
    const first = await writer.create(GRID);

    const second = await writer.create({ ...GRID, show: { new: { ...GRID_SHOW, title: "Other" } } });

    expect(second.venueId).toBe(first.venueId);
    expect(await count("venues")).toBe(1);
  });

  it.each([
    ["timezone", { name: "Globe", city: "London", countryCode: "GB", timezone: "Europe/Paris" }],
    ["country", { name: "Globe", city: "London", countryCode: "FR", timezone: "Europe/London" }],
  ])("answers VENUE_CONFLICT when the existing venue differs in %s and creates nothing", async (field, venue) => {
    const first = await writer.create(GRID);

    const attempt = writer.create({ ...GRID, show: { new: { ...GRID_SHOW, title: "Other" } }, venue: { new: venue } });

    await expect(attempt).rejects.toMatchObject({ kind: "business", publicCode: "VENUE_CONFLICT", message: expect.stringContaining(field) });
    expect(await attempt.catch((e: Error) => e.message)).not.toContain("Paris");
    expect([await count("shows"), await count("venues"), await count("events")]).toEqual([1, 1, 1]);
    expect(first.venueId).toBeDefined();
  });

  it("answers NotFoundError for an unknown show or venue and creates nothing", async () => {
    const unknown = "0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11";

    await expect(writer.create({ ...GRID, show: { existingId: unknown } })).rejects.toBeInstanceOf(NotFoundError);
    await expect(writer.create({ ...GRID, venue: { existingId: unknown } })).rejects.toMatchObject({ publicCode: "VENUE_NOT_FOUND" });
    expect([await count("shows"), await count("venues"), await count("events")]).toEqual([0, 0, 0]);
  });

});

describe("PrismaEventGridWriter atomicity", () => {
  it("leaves no show, venue or event behind when the event insert fails", async () => {
    await expect(writer.create({ ...GRID, rows: 201 })).rejects.toThrow();

    expect([await count("shows"), await count("venues"), await count("events"), await count("seats")]).toEqual([0, 0, 0, 0]);
  });

  it("leaves nothing behind when the seat insert fails midway", async () => {
    await prisma.client.$executeRawUnsafe(`CREATE FUNCTION fail_seat_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.seat_number = 3 THEN RAISE EXCEPTION 'poisoned seat'; END IF; RETURN NEW; END $$`);
    await prisma.client.$executeRawUnsafe("CREATE TRIGGER fail_seat_insert BEFORE INSERT ON seats FOR EACH ROW EXECUTE FUNCTION fail_seat_insert()");
    try {
      await expect(writer.create(GRID)).rejects.toThrow();
    } finally {
      await prisma.client.$executeRawUnsafe("DROP TRIGGER fail_seat_insert ON seats");
      await prisma.client.$executeRawUnsafe("DROP FUNCTION fail_seat_insert()");
    }

    expect([await count("shows"), await count("venues"), await count("events"), await count("seats")]).toEqual([0, 0, 0, 0]);
  });
});
