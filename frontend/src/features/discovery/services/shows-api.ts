import type { ApiClient } from "../../../shared/lib/api-client";
import type { Facets, ShowSearchResult } from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isStrings = (value: unknown): boolean => Array.isArray(value) && value.every((v) => typeof v === "string");

function isSearchResult(body: unknown): body is ShowSearchResult {
  return (
    isRecord(body) &&
    Array.isArray(body.items) &&
    body.items.every((item) => isRecord(item) && isRecord(item.venue)) &&
    typeof body.total === "number" &&
    typeof body.page === "number" &&
    typeof body.totalPages === "number"
  );
}

function isFacets(body: unknown): body is Facets {
  return (
    isRecord(body) &&
    isStrings(body.types) && isStrings(body.genres) && isStrings(body.countries) && isStrings(body.cities) &&
    Array.isArray(body.venues)
  );
}

/** The public catalog endpoints. The responses are checked for their shape, so a wrong body is an error, not a crash in a component. */
export class ShowsApi {
  constructor(private readonly client: ApiClient) {}

  async search(query: URLSearchParams): Promise<ShowSearchResult> {
    const qs = query.toString();
    const body = await this.client.get<unknown>(qs === "" ? "/shows" : `/shows?${qs}`);
    if (!isSearchResult(body)) {
      throw new Error("Unexpected response from GET /shows");
    }
    return body;
  }

  async facets(): Promise<Facets> {
    const body = await this.client.get<unknown>("/shows/facets");
    if (!isFacets(body)) {
      throw new Error("Unexpected response from GET /shows/facets");
    }
    return body;
  }
}
