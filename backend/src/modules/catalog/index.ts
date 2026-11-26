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
