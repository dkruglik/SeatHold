import type { FastifyPluginAsync } from "fastify";
import type { CatalogRouteOptions } from "./catalog-route-options.js";
import { showsFacetsRoute } from "./routes/shows-facets.route.js";
import { showsSearchRoute } from "./routes/shows-search.route.js";

export type CatalogPluginOptions = CatalogRouteOptions;

/** The public catalog routes (search, facets). Register it under the `/api` prefix. */
export const catalogPlugin: FastifyPluginAsync<CatalogPluginOptions> = async (app, options) => {
  const routeOptions: CatalogRouteOptions = { services: options.services };
  await app.register(showsSearchRoute, routeOptions);
  await app.register(showsFacetsRoute, routeOptions);
};
