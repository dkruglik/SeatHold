import { createRandom, pickIndex, seedUuid } from "./seeded-random.js";
import {
  BASE_PRICE_MINOR, GENRES, SEED_VENUES, SHOW_TYPES, TITLE_ENDS, TITLE_STARTS, type SeedVenue, type ShowType,
} from "./catalog-seed-vocabulary.js";

export { SHOW_TYPES, type SeedVenue } from "./catalog-seed-vocabulary.js";

export const SEED_SHOW_COUNT = 200;
export const SEED_WINDOW_DAYS = 90;
export const SEED_ROWS = 10;
export const SEED_SEATS_PER_ROW = 20;
const RNG_SEED = 20_260_101;
const MINUTE_MS = 60_000;
const MINUTES_PER_DAY = 24 * 60;

export interface SeedShow {
  readonly id: string;
  readonly title: string;
  readonly type: ShowType;
  readonly genre: string;
  readonly description: string;
}

export interface SeedEvent {
  readonly id: string;
  readonly showId: string;
  readonly venueName: string;
  readonly venueCity: string;
  readonly startsAt: Date;
  readonly priceMinor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seatsPerRow: number;
}

export interface CatalogSeed {
  readonly venues: readonly SeedVenue[];
  readonly shows: readonly SeedShow[];
  readonly events: readonly SeedEvent[];
}

export interface CatalogSeedInput {
  readonly now: Date;
  readonly currency: string;
}

function choose<T>(random: () => number, items: readonly T[]): T {
  return items[pickIndex(random, items.length)] as T;
}

/**
 * The whole catalog as plain data. Titles, genres, venues, prices and ids depend only on the fixed PRNG seed;
 * `now` only moves the start times. Ids come from stable keys, so a re-run inserts the same rows.
 */
export function generateCatalogSeed({ now, currency }: CatalogSeedInput): CatalogSeed {
  const random = createRandom(RNG_SEED);
  const shows: SeedShow[] = [];
  const events: SeedEvent[] = [];
  for (let index = 0; index < SEED_SHOW_COUNT; index += 1) {
    const type = SHOW_TYPES[index % SHOW_TYPES.length] as ShowType;
    const show = buildShow(random, index, type);
    shows.push(show);
    events.push(buildEvent(random, { index, show, now, currency }));
  }
  return { venues: SEED_VENUES, shows, events };
}

function buildShow(random: () => number, index: number, type: ShowType): SeedShow {
  const genre = choose(random, GENRES[type]);
  const title = `${choose(random, TITLE_STARTS)} ${choose(random, TITLE_ENDS[type])}`;
  return { id: seedUuid(`show:${index}`), title, type, genre, description: `${title}: a ${genre} ${type} night.` };
}

interface EventContext {
  readonly index: number;
  readonly show: SeedShow;
  readonly now: Date;
  readonly currency: string;
}

function buildEvent(random: () => number, { index, show, now, currency }: EventContext): SeedEvent {
  const venue = choose(random, SEED_VENUES);
  const window = SEED_WINDOW_DAYS * MINUTES_PER_DAY;
  const offsetMinutes = Math.floor((60 + pickIndex(random, window - 60)) / 15) * 15;
  const priceMinor = BASE_PRICE_MINOR[show.type] + pickIndex(random, 20) * 250;
  return {
    id: seedUuid(`event:${index}`),
    showId: show.id,
    venueName: venue.name,
    venueCity: venue.city,
    startsAt: new Date(now.getTime() + offsetMinutes * MINUTE_MS),
    priceMinor,
    currency,
    rows: SEED_ROWS,
    seatsPerRow: SEED_SEATS_PER_ROW,
  };
}
