import type { SeedEvent, SeedShow, SeedVenue } from "../../domain/catalog-seed-data.js";

/** Column arrays for `unnest(...)` bulk inserts: one array per column keeps the statement at a fixed parameter count. */
export function toVenueColumns(venues: readonly SeedVenue[]) {
  return {
    names: venues.map((v) => v.name),
    cities: venues.map((v) => v.city),
    countryCodes: venues.map((v) => v.countryCode),
    timezones: venues.map((v) => v.timezone),
  };
}

export function toShowColumns(shows: readonly SeedShow[]) {
  return {
    ids: shows.map((s) => s.id),
    titles: shows.map((s) => s.title),
    types: shows.map((s) => s.type),
    genres: shows.map((s) => s.genre),
    descriptions: shows.map((s) => s.description),
  };
}

export function toEventColumns(events: readonly SeedEvent[]) {
  return {
    ids: events.map((e) => e.id),
    showIds: events.map((e) => e.showId),
    venueNames: events.map((e) => e.venueName),
    venueCities: events.map((e) => e.venueCity),
    startsAt: events.map((e) => e.startsAt.toISOString()),
    prices: events.map((e) => e.priceMinor),
    currencies: events.map((e) => e.currency),
    rows: events.map((e) => e.rows),
    seatsPerRow: events.map((e) => e.seatsPerRow),
  };
}
