import type { FastifyPluginAsync } from "fastify";
import type { BackofficeServices } from "../../../backoffice-composition.js";
import { adminEventListSchema, pageQuerySchema, toAdminEventListDto, type PageQuery } from "../admin-read-dto.js";

/** GET /admin/events: every event with its seat counts. Registered inside the admin plugin, which guards it. */
export const listEventsRoute = (services: Pick<BackofficeServices, "listEvents">): FastifyPluginAsync => async (app) => {
  app.get<{ Querystring: PageQuery }>(
    "/events",
    { schema: { querystring: pageQuerySchema(20), response: { 200: adminEventListSchema } } },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      return toAdminEventListDto(await services.listEvents.execute(request.query));
    },
  );
};
