// Public API of the back-office module.
import type { FastifyPluginAsync } from "fastify";
import type { BackofficeServices } from "./backoffice-composition.js";
import { boughtTicketsRoute } from "./presentation/http/routes/bought-tickets.route.js";
import { createEventRoute } from "./presentation/http/routes/create-event.route.js";
import { listEventsRoute } from "./presentation/http/routes/list-events.route.js";
import { lookupsRoute } from "./presentation/http/routes/lookups.route.js";
import { openTicketsRoute } from "./presentation/http/routes/open-tickets.route.js";

export { createBackofficeServices, type BackofficeDeps, type BackofficeServices } from "./backoffice-composition.js";
export { CreateEventService, type CreateEventDeps } from "./application/create-event-service.js";
export { InvalidEvent } from "./domain/errors.js";

/** The back-office route modules. Register them only through the admin plugin, which guards every one of them. */
export const backofficeRoutes = (services: BackofficeServices): FastifyPluginAsync[] => [
  listEventsRoute(services),
  createEventRoute(services),
  lookupsRoute(services),
  openTicketsRoute(services),
  boughtTicketsRoute(services),
];
