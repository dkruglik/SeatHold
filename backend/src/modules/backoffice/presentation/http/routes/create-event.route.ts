import type { FastifyPluginAsync } from "fastify";
import type { RawCreateEvent } from "../../../domain/create-event-rules.js";
import type { BackofficeServices } from "../../../backoffice-composition.js";
import { createEventBodySchema, createdEventSchema, toCreatedEventDto } from "../backoffice-dto.js";

/**
 * POST /admin/events: creates an event with its seat grid. Registered inside the admin plugin, which already runs
 * the CSRF and Origin hooks on state-changing methods and the authentication and admin-role checks.
 */
export const createEventRoute = (services: Pick<BackofficeServices, "createEvent">): FastifyPluginAsync => async (app) => {
  app.post<{ Body: RawCreateEvent }>(
    "/events",
    { schema: { body: createEventBodySchema, response: { 201: createdEventSchema } } },
    async (request, reply) => {
      void reply.header("cache-control", "no-store");
      const event = await services.createEvent.execute(request.body);
      return reply.code(201).send(toCreatedEventDto(event));
    },
  );
};
