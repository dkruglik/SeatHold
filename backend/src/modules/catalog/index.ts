// Public API of the catalog module.
export type { CatalogSeedRepository } from "./application/ports/catalog-seed-repository.js";
export { SeedCatalogService, type CatalogSeedResult, type SeedCatalogDeps } from "./application/seed-catalog-service.js";
export { PrismaCatalogSeedRepository } from "./infrastructure/persistence/prisma-catalog-seed-repository.js";
export {
  createCatalogServices,
  createPrismaCatalogRepositories,
  type CatalogRepositories,
  type CatalogServices,
} from "./catalog-composition.js";
export { SearchEventsQuery, type EventSearchResult, type SearchEventsInput } from "./application/search-events-query.js";
export { GetFacetsQuery, type Facets } from "./application/get-facets-query.js";
export type { EventSearchReader, EventSearchCriteria, EventSearchRow } from "./application/ports/event-search-reader.js";
export type { FacetsReader, StoredFacets } from "./application/ports/facets-reader.js";
export { catalogPlugin, type CatalogPluginOptions } from "./presentation/http/catalog-plugin.js";
export { GetEventQuery } from "./application/get-event-query.js";
export type { EventDetailReader, EventDetailRow } from "./application/ports/event-detail-reader.js";
export { EventNotFound } from "./domain/errors.js";
export type { CreatedEvent, EventGridWriter, NewEventGrid, ShowRef, VenueRef } from "./application/ports/event-grid-writer.js";
export { PrismaEventGridWriter } from "./infrastructure/persistence/prisma-event-grid-writer.js";
export { rowLabel, rowLabels } from "./domain/row-label.js";
