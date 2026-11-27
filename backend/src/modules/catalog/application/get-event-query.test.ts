import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../../shared/errors/app-error.js";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { GetEventQuery } from "./get-event-query.js";
import type { EventDetailReader, EventDetailRow } from "./ports/event-detail-reader.js";

const NOW = new Date("2030-06-01T12:00:00.000Z");
const ROW: EventDetailRow = {
  eventId: "e1", showId: "s1", title: "Rock Night", type: "concert", genre: "rock", description: "Loud",
  venue: { id: "v1", name: "Olympia Hall", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
  startsAt: new Date("2030-07-01T18:00:00.000Z"), priceMinor: 4500, currency: "EUR", rows: 2, seatsPerRow: 5, seatsLeft: 7,
};

describe("GetEventQuery", () => {
  it("returns the event the reader found and reads the clock once, passing that instant as now", async () => {
    const seen: { eventId: string; now: Date }[] = [];
    const reader: EventDetailReader = { find: (eventId, now) => { seen.push({ eventId, now }); return Promise.resolve(ROW); } };

    const result = await new GetEventQuery({ reader, clock: new ControlledClock(NOW) }).execute("e1");

    expect(result).toEqual(ROW);
    expect(seen).toEqual([{ eventId: "e1", now: NOW }]);
  });

  it("throws EVENT_NOT_FOUND (a NotFoundError) when the reader finds nothing", async () => {
    const reader: EventDetailReader = { find: () => Promise.resolve(undefined) };

    const failure = await new GetEventQuery({ reader, clock: new ControlledClock(NOW) }).execute("missing").catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(NotFoundError);
    expect(failure).toMatchObject({ publicCode: "EVENT_NOT_FOUND" });
  });
});
