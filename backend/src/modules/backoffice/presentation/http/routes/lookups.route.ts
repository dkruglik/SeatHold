import type { FastifyPluginAsync } from "fastify";
import type { BackofficeServices } from "../../../backoffice-composition.js";
import { lookupsSchema } from "../admin-read-dto.js";

/** GET /admin/lookups: shows and venues for the create-event form. Registered inside the admin plugin, which guards it. */
export const lookupsRoute = (services: Pick<BackofficeServices, "lookups">): FastifyPluginAsync => async (app) => {
  app.get("/lookups", { schema: { response: { 200: lookupsSchema } } }, async (_request, reply) => {
    void reply.header("cache-control", "no-store");
    return services.lookups.execute();
  });
};
