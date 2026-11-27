import type { FastifyPluginAsync } from "fastify";
import { facetsResponseSchema, toFacetsDto } from "../catalog-dto.js";
import type { CatalogRouteOptions } from "../catalog-route-options.js";

/** GET /shows/facets: the values the search filters can take. Public and cacheable for a minute. */
export const showsFacetsRoute: FastifyPluginAsync<CatalogRouteOptions> = async (app, options) => {
  app.get("/shows/facets", { schema: { response: { 200: facetsResponseSchema } } }, async (_request, reply) => {
    const facets = await options.services.getFacets.execute();
    return reply.header("cache-control", "public, max-age=60").send(toFacetsDto(facets));
  });
};
