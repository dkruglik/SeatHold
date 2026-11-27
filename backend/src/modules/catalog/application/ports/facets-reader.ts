export interface StoredFacets {
  /** Distinct (type, genre) pairs of events that have not started. */
  readonly showKinds: readonly { readonly type: string; readonly genre: string }[];
  /** Venues that host at least one event that has not started. */
  readonly venues: readonly { readonly id: string; readonly name: string; readonly city: string; readonly countryCode: string }[];
}

export interface FacetsReader {
  read(now: Date): Promise<StoredFacets>;
}
