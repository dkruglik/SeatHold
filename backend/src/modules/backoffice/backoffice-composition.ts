import type { EventGridWriter } from "../catalog/index.js";
import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import type { Clock } from "../../shared/time/clock.js";
import { CreateEventService } from "./application/create-event-service.js";
import { GetLookupsQuery } from "./application/get-lookups-query.js";
import { ListAdminEventsQuery } from "./application/list-admin-events-query.js";
import { ListBoughtTicketsQuery } from "./application/list-bought-tickets-query.js";
import { ListOpenTicketsQuery } from "./application/list-open-tickets-query.js";
import { PrismaAdminEventListReader } from "./infrastructure/persistence/prisma-admin-event-list-reader.js";
import { PrismaAdminLookupsReader } from "./infrastructure/persistence/prisma-admin-lookups-reader.js";
import { PrismaEventTicketsReader } from "./infrastructure/persistence/prisma-event-tickets-reader.js";

export interface BackofficeServices {
  readonly createEvent: CreateEventService;
  readonly listEvents: ListAdminEventsQuery;
  readonly lookups: GetLookupsQuery;
  readonly listOpenTickets: ListOpenTicketsQuery;
  readonly listBoughtTickets: ListBoughtTicketsQuery;
}

export interface BackofficeDeps {
  readonly eventGridWriter: EventGridWriter;
  /** The read models (event list, lookups, tickets) are read-only SQL over the shared tables, owned by this module. */
  readonly prisma: PrismaService;
  readonly clock: Clock;
}

export function createBackofficeServices(deps: BackofficeDeps): BackofficeServices {
  const tickets = new PrismaEventTicketsReader(deps.prisma);
  return {
    createEvent: new CreateEventService({ writer: deps.eventGridWriter, clock: deps.clock }),
    listEvents: new ListAdminEventsQuery({ reader: new PrismaAdminEventListReader(deps.prisma), clock: deps.clock }),
    lookups: new GetLookupsQuery({ reader: new PrismaAdminLookupsReader(deps.prisma) }),
    listOpenTickets: new ListOpenTicketsQuery({ reader: tickets, clock: deps.clock }),
    listBoughtTickets: new ListBoughtTicketsQuery({ reader: tickets }),
  };
}
