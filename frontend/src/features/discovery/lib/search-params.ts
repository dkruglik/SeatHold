import type { SearchFilters } from "../types";

const maxText = 100;
const maxPage = 100_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const countryPattern = /^[A-Za-z]{2}$/;

type FilterKey = Exclude<keyof SearchFilters, "page">;

/** Every filter key, in the order they are written to the URL. */
const filterKeys: readonly FilterKey[] = ["q", "type", "genre", "country", "city", "venueId", "from", "to"];

function text(raw: string | null): string | undefined {
  const value = raw?.trim().slice(0, maxText);
  return value === undefined || value === "" ? undefined : value;
}

function instant(raw: string | null): string | undefined {
  if (raw === null) {
    return undefined;
  }
  const time = Date.parse(raw);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function page(raw: string | null): number {
  const value = raw !== null && /^\d+$/.test(raw) ? Number(raw) : 1;
  return value >= 1 && value <= maxPage ? value : 1;
}

/** Reads the filters from the URL. Anything the API would reject (junk, empty, inverted range) is ignored, so the page never crashes or sends it. */
export function readFilters(params: URLSearchParams): SearchFilters {
  const country = params.get("country");
  const venueId = params.get("venueId");
  const from = instant(params.get("from"));
  const to = instant(params.get("to"));
  const entries: [FilterKey, string | undefined][] = [
    ["q", text(params.get("q"))],
    ["type", text(params.get("type"))],
    ["genre", text(params.get("genre"))],
    ["country", country !== null && countryPattern.test(country) ? country : undefined],
    ["city", text(params.get("city"))],
    ["venueId", venueId !== null && uuidPattern.test(venueId) ? venueId : undefined],
    ["from", from],
    ["to", from !== undefined && to !== undefined && to < from ? undefined : to],
  ];
  const filters: Record<string, string | number> = { page: page(params.get("page")) };
  for (const [key, value] of entries) {
    if (value !== undefined) {
      filters[key] = value;
    }
  }
  return filters as unknown as SearchFilters;
}

function writePage(params: URLSearchParams, value: number): void {
  if (value > 1) {
    params.set("page", String(value));
  }
}

/** The API query for the filters: only what is set, and no `page` for page 1 (the API default). */
export function toApiQuery(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value !== undefined) {
      params.set(key, value);
    }
  }
  writePage(params, filters.page);
  return params;
}

/**
 * The next URL: the current filters with `patch` applied (undefined or "" removes a filter). The page resets to 1
 * unless `nextPage` is given. Unknown params are dropped.
 */
export function patchFilters(current: URLSearchParams, patch: Partial<Record<FilterKey, string | undefined>>, nextPage = 1): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of filterKeys) {
    const value = key in patch ? patch[key] : current.get(key);
    if (value !== undefined && value !== null && value !== "") {
      next.set(key, value);
    }
  }
  writePage(next, nextPage);
  return next;
}
