import type { CatalogServices } from "../../catalog-composition.js";

/** What every catalog route module receives. The catalog routes are public GETs: no auth and no CSRF hooks. */
export interface CatalogRouteOptions {
  readonly services: Pick<CatalogServices, "searchEvents" | "getFacets" | "getEvent">;
}
