import type { FastifyPluginAsync } from "fastify";

/** GET /admin/ping: placeholder for the back-office, so the admin boundary has a route to prove it on (replaced in Phase 4). */
export const adminPingRoute: FastifyPluginAsync = async (app) => {
  app.get("/ping", { schema: { response: { 200: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } } } }, () => ({ ok: true }));
};
