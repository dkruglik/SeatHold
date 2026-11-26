import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import type { AppConfig } from "../../config/load-config.js";
import type { Clock } from "../../shared/time/clock.js";
import type { CatalogSeedRepository } from "./application/ports/catalog-seed-repository.js";
import { SeedCatalogService } from "./application/seed-catalog-service.js";
import { PrismaCatalogSeedRepository } from "./infrastructure/persistence/prisma-catalog-seed-repository.js";

export interface CatalogRepositories {
  readonly seed: CatalogSeedRepository;
}

export interface CatalogServices {
  readonly seedCatalog: SeedCatalogService;
}

export function createPrismaCatalogRepositories(prisma: PrismaService): CatalogRepositories {
  return { seed: new PrismaCatalogSeedRepository(prisma) };
}

/** Wires the catalog use cases from validated config and the given ports. */
export function createCatalogServices(config: Pick<AppConfig, "defaultCurrency">, deps: CatalogRepositories & { readonly clock: Clock }): CatalogServices {
  return { seedCatalog: new SeedCatalogService({ catalog: deps.seed, clock: deps.clock, currency: config.defaultCurrency }) };
}
