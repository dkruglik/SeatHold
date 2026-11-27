import { ValidationError } from "../../../shared/errors/app-error.js";
import { assertOffsetWithinLimit } from "../../../shared/pagination/offset-limit.js";
import type { Clock } from "../../../shared/time/clock.js";
import type { EventSearchReader, EventSearchRow } from "./ports/event-search-reader.js";

/** Search results are paged only to this offset; deeper pages ask the caller to refine the filters. */
export const SEARCH_OFFSET_LIMIT = 10_000;

export interface SearchEventsInput {
  readonly q?: string;
  readonly type?: string;
  readonly genre?: string;
  readonly country?: string;
  readonly city?: string;
  readonly venueId?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly page: number;
  readonly pageSize: number;
}

export interface EventSearchResult {
  readonly items: readonly EventSearchRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

/**
 * Public event search (plan section 2): one row per event, filters combined with AND, ordered by start then id.
 * Without `from` only events that have not started are listed (DECISIONS.md); the clock is read once.
 */
export class SearchEventsQuery {
  constructor(private readonly deps: { readonly reader: EventSearchReader; readonly clock: Clock }) {}

  async execute(input: SearchEventsInput): Promise<EventSearchResult> {
    if (input.from !== undefined && input.to !== undefined && input.from.getTime() > input.to.getTime()) {
      throw new ValidationError("from must not be after to", { publicCode: "invalid_date_range" });
    }
    assertOffsetWithinLimit(input.page, input.pageSize, SEARCH_OFFSET_LIMIT);
    const now = await this.deps.clock.now();
    const q = input.q?.trim();
    const { rows, total } = await this.deps.reader.search({
      ...(q === undefined || q === "" ? {} : { q }),
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.genre === undefined ? {} : { genre: input.genre }),
      ...(input.country === undefined ? {} : { country: input.country.toUpperCase() }),
      ...(input.city === undefined ? {} : { city: input.city }),
      ...(input.venueId === undefined ? {} : { venueId: input.venueId }),
      ...(input.from === undefined ? { after: now } : { from: input.from }),
      ...(input.to === undefined ? {} : { to: input.to }),
      offset: (input.page - 1) * input.pageSize,
      limit: input.pageSize,
      now,
    });
    return { items: rows, total, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(total / input.pageSize) };
  }
}
