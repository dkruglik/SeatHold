import type { Facets } from "../../application/get-facets-query.js";
import type { EventSearchResult } from "../../application/search-events-query.js";

/** Unknown parameters are rejected with 400 (`propertyNames`), as Ajv would otherwise drop them silently. */
export const searchQuerySchema = {
  type: "object",
  properties: {
    q: { type: "string", minLength: 1, maxLength: 100 },
    type: { type: "string", minLength: 1, maxLength: 100 },
    genre: { type: "string", minLength: 1, maxLength: 100 },
    country: { type: "string", pattern: "^[A-Za-z]{2}$" },
    city: { type: "string", minLength: 1, maxLength: 100 },
    venueId: { type: "string", format: "uuid" },
    from: { type: "string", format: "date-time" },
    to: { type: "string", format: "date-time" },
    page: { type: "integer", minimum: 1, maximum: 100000, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 50, default: 20 },
  },
  propertyNames: { enum: ["q", "type", "genre", "country", "city", "venueId", "from", "to", "page", "pageSize"] },
  additionalProperties: false,
} as const;

export interface SearchQuery {
  readonly q?: string;
  readonly type?: string;
  readonly genre?: string;
  readonly country?: string;
  readonly city?: string;
  readonly venueId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly page: number;
  readonly pageSize: number;
}

const str = { type: "string" } as const;

export const searchResponseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          eventId: str, showId: str, title: str, type: str, genre: str,
          venue: {
            type: "object",
            properties: { id: str, name: str, city: str, countryCode: str, timezone: str },
            required: ["id", "name", "city", "countryCode", "timezone"],
          },
          startsAt: str, priceMinor: { type: "integer" }, currency: str, seatsLeft: { type: "integer" },
        },
        required: ["eventId", "showId", "title", "type", "genre", "venue", "startsAt", "priceMinor", "currency", "seatsLeft"],
      },
    },
    total: { type: "integer" }, page: { type: "integer" }, pageSize: { type: "integer" }, totalPages: { type: "integer" },
  },
  required: ["items", "total", "page", "pageSize", "totalPages"],
} as const;

export const toSearchDto = (result: EventSearchResult) => ({
  items: result.items.map((r) => ({ ...r, startsAt: r.startsAt.toISOString() })),
  total: result.total, page: result.page, pageSize: result.pageSize, totalPages: result.totalPages,
});

const strings = { type: "array", items: str } as const;

export const facetsResponseSchema = {
  type: "object",
  properties: {
    types: strings, genres: strings, countries: strings, cities: strings,
    venues: { type: "array", items: { type: "object", properties: { id: str, name: str, city: str }, required: ["id", "name", "city"] } },
  },
  required: ["types", "genres", "countries", "cities", "venues"],
} as const;

export const toFacetsDto = (facets: Facets): Facets => facets;
