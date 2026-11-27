import type { AdminLookupsReader, LookupShow, LookupVenue } from "./ports/admin-readers.js";

/** Each lookup list is capped, so the create form never loads an unbounded table. Beyond this, the form needs a search box. */
export const LOOKUP_LIMIT = 500;

export class GetLookupsQuery {
  constructor(private readonly deps: { readonly reader: AdminLookupsReader }) {}

  execute(): Promise<{ readonly shows: readonly LookupShow[]; readonly venues: readonly LookupVenue[] }> {
    return this.deps.reader.load(LOOKUP_LIMIT);
  }
}
