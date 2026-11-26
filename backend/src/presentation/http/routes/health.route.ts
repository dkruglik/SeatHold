import type { FastifyPluginAsync } from "fastify";

/** Liveness for the container health check and the load balancer. No database access. */
export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/health",
    { schema: { response: { 200: { type: "object", properties: { status: { type: "string" } }, required: ["status"] } } } },
    () => ({ status: "ok" }),
  );
};
