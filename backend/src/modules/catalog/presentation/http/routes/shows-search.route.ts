import type { FastifyPluginAsync } from "fastify";
import { searchQuerySchema, searchResponseSchema, toSearchDto, type SearchQuery } from "../catalog-dto.js";
import type { CatalogRouteOptions } from "../catalog-route-options.js";

/** GET /shows: public event search. Reads no cookie and sets none; the answer is the same for every viewer. */
export const showsSearchRoute: FastifyPluginAsync<CatalogRouteOptions> = async (app, options) => {
  app.get<{ Querystring: SearchQuery }>(
    "/shows",
    { schema: { querystring: searchQuerySchema, response: { 200: searchResponseSchema } } },
    async (request, reply) => {
      const { from, to, ...rest } = request.query;
      const result = await options.services.searchEvents.execute({
        ...rest,
        ...(from === undefined ? {} : { from: new Date(from) }),
        ...(to === undefined ? {} : { to: new Date(to) }),
      });
      return reply.header("cache-control", "public, max-age=1").send(toSearchDto(result));
    },
  );
};
