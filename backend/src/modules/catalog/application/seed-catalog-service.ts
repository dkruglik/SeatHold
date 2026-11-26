import type { Clock } from "../../../shared/time/clock.js";
import { generateCatalogSeed } from "../domain/catalog-seed-data.js";
import type { CatalogSeedRepository } from "./ports/catalog-seed-repository.js";

/** Rows created by one run. A second run with the same catalog creates none. */
export interface CatalogSeedResult {
  readonly venues: number;
  readonly shows: number;
  readonly events: number;
  readonly seats: number;
}

export interface SeedCatalogDeps {
  readonly catalog: CatalogSeedRepository;
  readonly clock: Clock;
  readonly currency: string;
}

/** Seeds the deterministic demo catalog (DECISIONS.md). Idempotent: natural keys and stable ids make every insert a no-op on a re-run. */
export class SeedCatalogService {
  constructor(private readonly deps: SeedCatalogDeps) {}

  async seed(): Promise<CatalogSeedResult> {
    const { catalog, clock, currency } = this.deps;
    const data = generateCatalogSeed({ now: await clock.now(), currency });
    const venues = await catalog.insertVenues(data.venues);
    const shows = await catalog.insertShows(data.shows);
    const { events, seats } = await catalog.insertEventsWithSeats(data.events);
    return { venues, shows, events, seats };
  }
}
