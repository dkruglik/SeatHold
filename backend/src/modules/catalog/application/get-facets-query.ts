import type { Clock } from "../../../shared/time/clock.js";
import type { FacetsReader } from "./ports/facets-reader.js";

export interface Facets {
  readonly types: readonly string[];
  readonly genres: readonly string[];
  readonly countries: readonly string[];
  readonly cities: readonly string[];
  readonly venues: readonly { readonly id: string; readonly name: string; readonly city: string }[];
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort(compare);

/** The values the search filters can take, so the dropdowns offer only what exists. Sorted for a stable response. */
export class GetFacetsQuery {
  constructor(private readonly deps: { readonly reader: FacetsReader; readonly clock: Clock }) {}

  async execute(): Promise<Facets> {
    const stored = await this.deps.reader.read(await this.deps.clock.now());
    return {
      types: sortedUnique(stored.showKinds.map((k) => k.type)),
      genres: sortedUnique(stored.showKinds.map((k) => k.genre)),
      countries: sortedUnique(stored.venues.map((v) => v.countryCode)),
      cities: sortedUnique(stored.venues.map((v) => v.city)),
      venues: stored.venues.map((v) => ({ id: v.id, name: v.name, city: v.city })).sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id)),
    };
  }
}
