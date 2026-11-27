export interface VenueSummary {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly countryCode: string;
  /** IANA timezone name; the event time is shown in it. */
  readonly timezone: string;
}

/** One search result row: one event (show + venue + date). */
export interface ShowItem {
  readonly eventId: string;
  readonly showId: string;
  readonly title: string;
  readonly type: string;
  readonly genre: string;
  readonly venue: VenueSummary;
  /** ISO instant (UTC). */
  readonly startsAt: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly seatsLeft: number;
}

export interface ShowSearchResult {
  readonly items: readonly ShowItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface Facets {
  readonly types: readonly string[];
  readonly genres: readonly string[];
  readonly countries: readonly string[];
  readonly cities: readonly string[];
  readonly venues: readonly { readonly id: string; readonly name: string; readonly city: string }[];
}

/** The filters as the URL and the API name them. Absent means not set; never an empty string. */
export interface SearchFilters {
  readonly q?: string;
  readonly type?: string;
  readonly genre?: string;
  readonly country?: string;
  readonly city?: string;
  readonly venueId?: string;
  /** ISO instants (UTC). */
  readonly from?: string;
  readonly to?: string;
  readonly page: number;
}
