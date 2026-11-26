import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import type { SeedEvent, SeedShow, SeedVenue } from "../domain/catalog-seed-data.js";
import type { CatalogSeedRepository } from "./ports/catalog-seed-repository.js";
import { SeedCatalogService } from "./seed-catalog-service.js";

const NOW = new Date("2026-03-01T08:00:00Z");

class FakeRepository implements CatalogSeedRepository {
  readonly calls: string[] = [];
  venues: readonly SeedVenue[] = [];
  shows: readonly SeedShow[] = [];
  events: readonly SeedEvent[] = [];

  insertVenues(venues: readonly SeedVenue[]) { this.calls.push("venues"); this.venues = venues; return Promise.resolve(venues.length); }
  insertShows(shows: readonly SeedShow[]) { this.calls.push("shows"); this.shows = shows; return Promise.resolve(shows.length); }
  insertEventsWithSeats(events: readonly SeedEvent[]) {
    this.calls.push("events");
    this.events = events;
    return Promise.resolve({ events: events.length, seats: events.length * 200 });
  }
}

describe("SeedCatalogService", () => {
  it("seeds venues, then shows, then events with seats, using the clock's now and the configured currency", async () => {
    const repo = new FakeRepository();
    const service = new SeedCatalogService({ catalog: repo, clock: new ControlledClock(NOW), currency: "GBP" });

    const result = await service.seed();

    expect(repo.calls).toEqual(["venues", "shows", "events"]);
    expect(result).toEqual({ venues: 12, shows: 200, events: 200, seats: 40_000 });
    expect(repo.events.every((e) => e.currency === "GBP" && e.startsAt > NOW)).toBe(true);
  });

  it("reads the clock once per run", async () => {
    let reads = 0;
    const clock = { now: () => { reads += 1; return Promise.resolve(NOW); } };

    await new SeedCatalogService({ catalog: new FakeRepository(), clock, currency: "EUR" }).seed();

    expect(reads).toBe(1);
  });
});
