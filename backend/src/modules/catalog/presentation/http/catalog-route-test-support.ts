import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach } from "vitest";
import { buildApp } from "../../../../app.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { testConfig } from "../../../auth/presentation/http/auth-route-test-support.js";
import { createCatalogServices, createPrismaCatalogRepositories } from "../../catalog-composition.js";
import { NOW } from "../../infrastructure/persistence/catalog-search-fixture.js";
import { useBookingDatabase } from "../../infrastructure/persistence/catalog-test-support.js";

export interface CatalogHarness {
  readonly prisma: PrismaService;
  readonly clock: ControlledClock;
  readonly get: (url: string) => Promise<LightMyRequestResponse>;
}

/** The real app with only the catalog routes over the throwaway database and a controlled clock. */
export function useCatalogApp(): CatalogHarness {
  const prisma = useBookingDatabase();
  const clock = new ControlledClock(NOW);
  let current: FastifyInstance | undefined;
  beforeEach(async () => {
    clock.set(NOW);
    const config = testConfig();
    const catalog = createCatalogServices(config, { ...createPrismaCatalogRepositories(prisma), clock });
    current = buildApp(config, { clock, catalog: { services: catalog } });
    await current.ready();
  });
  afterEach(() => current?.close());
  const get: CatalogHarness["get"] = (url) => {
    if (current === undefined) throw new Error("app is built in beforeEach");
    return current.inject({ method: "GET", url });
  };
  return { prisma, clock, get };
}
