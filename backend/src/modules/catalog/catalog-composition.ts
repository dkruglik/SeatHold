import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import type { AppConfig } from "../../config/load-config.js";
import type { Clock } from "../../shared/time/clock.js";
import { GetEventQuery } from "./application/get-event-query.js";
import { GetFacetsQuery } from "./application/get-facets-query.js";
import type { CatalogSeedRepository } from "./application/ports/catalog-seed-repository.js";
import type { EventDetailReader } from "./application/ports/event-detail-reader.js";
import type { EventSearchReader } from "./application/ports/event-search-reader.js";
import type { FacetsReader } from "./application/ports/facets-reader.js";
import { SearchEventsQuery } from "./application/search-events-query.js";
import { SeedCatalogService } from "./application/seed-catalog-service.js";
import { PrismaCatalogSeedRepository } from "./infrastructure/persistence/prisma-catalog-seed-repository.js";
import { PrismaEventDetailReader } from "./infrastructure/persistence/prisma-event-detail-reader.js";
import { PrismaEventSearchReader } from "./infrastructure/persistence/prisma-event-search-reader.js";
import { PrismaFacetsReader } from "./infrastructure/persistence/prisma-facets-reader.js";

export interface CatalogRepositories {
  readonly seed: CatalogSeedRepository;
  readonly eventSearch: EventSearchReader;
  readonly facets: FacetsReader;
  readonly eventDetail: EventDetailReader;
}

export interface CatalogServices {
  readonly seedCatalog: SeedCatalogService;
  readonly searchEvents: SearchEventsQuery;
  readonly getFacets: GetFacetsQuery;
  readonly getEvent: GetEventQuery;
}

export function createPrismaCatalogRepositories(prisma: PrismaService): CatalogRepositories {
  return { seed: new PrismaCatalogSeedRepository(prisma), eventSearch: new PrismaEventSearchReader(prisma), facets: new PrismaFacetsReader(prisma), eventDetail: new PrismaEventDetailReader(prisma) };
}

/** Wires the catalog use cases from validated config and the given ports. */
export function createCatalogServices(config: Pick<AppConfig, "defaultCurrency">, deps: CatalogRepositories & { readonly clock: Clock }): CatalogServices {
  return {
    seedCatalog: new SeedCatalogService({ catalog: deps.seed, clock: deps.clock, currency: config.defaultCurrency }),
    searchEvents: new SearchEventsQuery({ reader: deps.eventSearch, clock: deps.clock }),
    getFacets: new GetFacetsQuery({ reader: deps.facets, clock: deps.clock }),
    getEvent: new GetEventQuery({ reader: deps.eventDetail, clock: deps.clock }),
  };
}
