import type { SeedEvent, SeedShow, SeedVenue } from "../../domain/catalog-seed-data.js";

/** Every method inserts what is missing and returns how many rows it created; rows that exist are left as they are. */
export interface CatalogSeedRepository {
  insertVenues(venues: readonly SeedVenue[]): Promise<number>;
  insertShows(shows: readonly SeedShow[]): Promise<number>;
  /** Inserts the missing events with their seat grids in one transaction, so no event is left without seats. */
  insertEventsWithSeats(events: readonly SeedEvent[]): Promise<{ readonly events: number; readonly seats: number }>;
}
