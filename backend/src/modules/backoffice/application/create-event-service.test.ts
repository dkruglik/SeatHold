import { describe, expect, it } from "vitest";
import type { EventGridWriter, NewEventGrid } from "../../catalog/index.js";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { CreateEventService } from "./create-event-service.js";

const clock = new ControlledClock(new Date("2030-01-01T10:00:00.000Z"));
const summary = { eventId: "e", showId: "s", venueId: "v", title: "T", startsAt: new Date("2030-06-01T18:00:00.000Z"), priceMinor: 1, currency: "EUR", rows: 2, seatsPerRow: 3, seatCount: 6 };
const input = {
  show: { existingId: "0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11" },
  venue: { existingId: "1b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11" },
  startsAt: "2030-06-01T18:00:00.000Z",
  priceMinor: 1,
  currency: "eur",
  rows: 2,
  seatsPerRow: 3,
};

describe("CreateEventService", () => {
  it("passes the validated, normalised grid to the writer and returns its summary", async () => {
    const calls: NewEventGrid[] = [];
    const writer: EventGridWriter = { create: async (grid) => (calls.push(grid), summary) };

    expect(await new CreateEventService({ writer, clock }).execute(input)).toEqual(summary);
    expect(calls).toEqual([{ ...input, startsAt: new Date(input.startsAt), currency: "EUR" }]);
  });

  it("does not call the writer for an invalid input", async () => {
    let called = false;
    const writer: EventGridWriter = { create: async () => ((called = true), summary) };

    await expect(new CreateEventService({ writer, clock }).execute({ ...input, rows: 0 })).rejects.toMatchObject({ publicCode: "INVALID_EVENT" });
    expect(called).toBe(false);
  });
});
