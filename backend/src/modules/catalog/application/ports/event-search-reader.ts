/** The filters the reader applies, already normalised by the query. Every present field narrows the result (AND). */
export interface EventSearchCriteria {
  readonly q?: string;
  readonly type?: string;
  readonly genre?: string;
  /** Upper-case ISO 3166-1 alpha-2 code. */
  readonly country?: string;
  readonly city?: string;
  readonly venueId?: string;
  /** Inclusive lower bound on the start. */
  readonly from?: Date;
  /** Exclusive lower bound on the start; used when no `from` is given. */
  readonly after?: Date;
  /** Inclusive upper bound on the start. */
  readonly to?: Date;
  readonly offset: number;
  readonly limit: number;
  /** The one clock reading of this request; seats whose hold ends at or before it count as available. */
  readonly now: Date;
}

export interface EventSearchRow {
  readonly eventId: string;
  readonly showId: string;
  readonly title: string;
  readonly type: string;
  readonly genre: string;
  readonly venue: { readonly id: string; readonly name: string; readonly city: string; readonly countryCode: string; readonly timezone: string };
  readonly startsAt: Date;
  readonly priceMinor: number;
  readonly currency: string;
  readonly seatsLeft: number;
}

export interface EventSearchPage {
  readonly rows: readonly EventSearchRow[];
  /** Events matching the filters, across all pages. */
  readonly total: number;
}

export interface EventSearchReader {
  search(criteria: EventSearchCriteria): Promise<EventSearchPage>;
}
