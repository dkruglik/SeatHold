import { describe, expect, it } from "vitest";
import { generateCatalogSeed, SHOW_TYPES } from "./catalog-seed-data.js";

const NOW = new Date("2026-01-01T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const input = { now: NOW, currency: "EUR" };

describe("generateCatalogSeed", () => {
  it("produces 12 venues in 5 countries and 8 cities, 200 shows and 200 events", () => {
    const seed = generateCatalogSeed(input);

    expect(seed.venues).toHaveLength(12);
    expect(new Set(seed.venues.map((v) => v.countryCode)).size).toBe(5);
    expect(new Set(seed.venues.map((v) => v.city)).size).toBe(8);
    expect(seed.shows).toHaveLength(200);
    expect(seed.events).toHaveLength(200);
  });

  it("gives every event a 10 x 20 grid, one show, and a known venue", () => {
    const seed = generateCatalogSeed(input);
    const venues = new Set(seed.venues.map((v) => `${v.name}|${v.city}`));
    const shows = new Set(seed.shows.map((s) => s.id));

    for (const event of seed.events) {
      expect([event.rows, event.seatsPerRow]).toEqual([10, 20]);
      expect(shows.has(event.showId)).toBe(true);
      expect(venues.has(`${event.venueName}|${event.venueCity}`)).toBe(true);
    }
    expect(new Set(seed.events.map((e) => e.showId)).size).toBe(200);
  });

  it("is identical for the same inputs", () => {
    expect(generateCatalogSeed(input)).toEqual(generateCatalogSeed({ ...input }));
  });

  it("keeps ids, titles, venues and prices when only now changes", () => {
    const later = generateCatalogSeed({ ...input, now: new Date(NOW.getTime() + 5 * DAY_MS) });
    const base = generateCatalogSeed(input);

    expect(later.shows).toEqual(base.shows);
    expect(later.events.map((e) => [e.id, e.venueName, e.priceMinor])).toEqual(base.events.map((e) => [e.id, e.venueName, e.priceMinor]));
  });

  it("starts every event within the 90 days after now", () => {
    for (const event of generateCatalogSeed(input).events) {
      expect(event.startsAt.getTime()).toBeGreaterThan(NOW.getTime());
      expect(event.startsAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + 90 * DAY_MS);
    }
  });

  it("covers all six show types with several genres", () => {
    const seed = generateCatalogSeed(input);

    expect(SHOW_TYPES).toEqual(["concert", "theatre", "sport", "stand-up", "opera", "festival"]);
    for (const type of SHOW_TYPES) {
      expect(seed.shows.some((s) => s.type === type)).toBe(true);
    }
    expect(new Set(seed.shows.map((s) => s.genre)).size).toBeGreaterThan(6);
  });

});

describe("generateCatalogSeed prices and ids", () => {
  it("uses non-negative integer minor-unit prices in the given currency", () => {
    for (const event of generateCatalogSeed({ ...input, currency: "USD" }).events) {
      expect(Number.isInteger(event.priceMinor)).toBe(true);
      expect(event.priceMinor).toBeGreaterThanOrEqual(0);
      expect(event.currency).toBe("USD");
    }
  });

  it("uses unique show and event ids", () => {
    const seed = generateCatalogSeed(input);

    expect(new Set(seed.shows.map((s) => s.id)).size).toBe(200);
    expect(new Set(seed.events.map((e) => e.id)).size).toBe(200);
    expect(seed.events[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
