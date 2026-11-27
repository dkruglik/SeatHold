import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/errors/app-error.js";
import { parseCreateEvent, type RawCreateEvent } from "./create-event-rules.js";

const NOW = new Date("2030-01-01T10:00:00.000Z");
const VALID: RawCreateEvent = {
  show: { new: { title: "Hamlet", type: "theatre", genre: "drama", description: "A play" } },
  venue: { new: { name: "Globe", city: "London", countryCode: "gb", timezone: "Europe/London" } },
  startsAt: "2030-06-01T18:00:00.000Z",
  priceMinor: 5000,
  currency: "eur",
  rows: 10,
  seatsPerRow: 20,
};
const parse = (patch: Partial<RawCreateEvent> = {}) => parseCreateEvent({ ...VALID, ...patch }, NOW);
const showWith = (patch: object) => ({ show: { new: { ...VALID.show.new, ...patch } } }) as Partial<RawCreateEvent>;
const venueWith = (patch: object) => ({ venue: { new: { ...VALID.venue.new, ...patch } } }) as Partial<RawCreateEvent>;
const bad = (patch: Partial<RawCreateEvent>) => {
  try {
    parse(patch);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).publicCode).toBe("INVALID_EVENT");
    return;
  }
  throw new Error("expected INVALID_EVENT");
};
const UUID = "0b9a1f0e-2c1d-4e55-9a41-3f2f6b7c1d11";

describe("parseCreateEvent text fields", () => {
  it("accepts a valid input and normalises country and currency to upper case", () => {
    const parsed = parse();
    expect(parsed.venue).toEqual({ new: { name: "Globe", city: "London", countryCode: "GB", timezone: "Europe/London" } });
    expect(parsed.currency).toBe("EUR");
    expect(parsed.startsAt).toEqual(new Date("2030-06-01T18:00:00.000Z"));
  });

  it.each([["title"], ["type"], ["genre"]])("bounds show %s to 1..100 characters", (field) => {
    expect(() => parse(showWith({ [field]: "x" }))).not.toThrow();
    expect(() => parse(showWith({ [field]: "x".repeat(100) }))).not.toThrow();
    bad(showWith({ [field]: "" }));
    bad(showWith({ [field]: "x".repeat(101) }));
  });

  it("bounds the description to 0..2000 characters", () => {
    expect(() => parse(showWith({ description: "" }))).not.toThrow();
    expect(() => parse(showWith({ description: "x".repeat(2000) }))).not.toThrow();
    bad(showWith({ description: "x".repeat(2001) }));
  });

  it.each([["name"], ["city"]])("bounds venue %s to 1..100 characters", (field) => {
    expect(() => parse(venueWith({ [field]: "x".repeat(100) }))).not.toThrow();
    bad(venueWith({ [field]: "" }));
    bad(venueWith({ [field]: "x".repeat(101) }));
  });

  it("requires a two-letter country code", () => {
    bad(venueWith({ countryCode: "G" }));
    bad(venueWith({ countryCode: "GBR" }));
    bad(venueWith({ countryCode: "G1" }));
  });

  it("requires a valid IANA timezone", () => {
    expect(() => parse(venueWith({ timezone: "America/New_York" }))).not.toThrow();
    bad(venueWith({ timezone: "Mars/Olympus" }));
    bad(venueWith({ timezone: "" }));
  });

});

describe("parseCreateEvent time, price and grid", () => {
  it("requires startsAt to be an ISO instant strictly in the future and within 3 years", () => {
    expect(() => parse({ startsAt: "2030-01-01T10:00:00.001Z" })).not.toThrow();
    expect(() => parse({ startsAt: "2032-12-31T10:00:00.000Z" })).not.toThrow();
    bad({ startsAt: "2030-01-01T10:00:00.000Z" });
    bad({ startsAt: "2029-12-31T10:00:00.000Z" });
    bad({ startsAt: "2033-01-02T10:00:00.000Z" });
    bad({ startsAt: "tomorrow" });
    bad({ startsAt: "2030-06-01" });
  });

  it("bounds priceMinor to an integer 0..1,000,000", () => {
    expect(parse({ priceMinor: 0 }).priceMinor).toBe(0);
    expect(parse({ priceMinor: 1_000_000 }).priceMinor).toBe(1_000_000);
    bad({ priceMinor: -1 });
    bad({ priceMinor: 1_000_001 });
    bad({ priceMinor: 10.5 });
    bad({ priceMinor: "10" as unknown as number });
  });

  it("requires a three-letter currency", () => {
    bad({ currency: "EU" });
    bad({ currency: "EURO" });
    bad({ currency: "E1R" });
  });

});

describe("parseCreateEvent grid and references", () => {
  it("bounds rows and seatsPerRow to 1..200 and the grid to 20,000 seats", () => {
    expect(parse({ rows: 1, seatsPerRow: 1 }).rows).toBe(1);
    expect(parse({ rows: 100, seatsPerRow: 200 }).rows).toBe(100);
    expect(parse({ rows: 200, seatsPerRow: 100 }).seatsPerRow).toBe(100);
    bad({ rows: 0 });
    bad({ rows: 201 });
    bad({ seatsPerRow: 0 });
    bad({ seatsPerRow: 201 });
    bad({ rows: 101, seatsPerRow: 200 });
    bad({ rows: 1.5 });
  });

  it("takes exactly one of existingId or new for the show and for the venue", () => {
    expect(parse({ show: { existingId: UUID } }).show).toEqual({ existingId: UUID });
    expect(parse({ venue: { existingId: UUID } }).venue).toEqual({ existingId: UUID });
    bad({ show: {} as never });
    bad({ show: { existingId: UUID, new: VALID.show.new } as never });
    bad({ venue: {} as never });
    bad({ venue: { existingId: UUID, new: VALID.venue.new } as never });
    bad({ show: { existingId: "not-a-uuid" } });
  });
});
