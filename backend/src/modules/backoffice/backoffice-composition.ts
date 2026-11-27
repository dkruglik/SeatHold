import type { EventGridWriter } from "../catalog/index.js";
import type { Clock } from "../../shared/time/clock.js";
import { CreateEventService } from "./application/create-event-service.js";

export interface BackofficeServices {
  readonly createEvent: CreateEventService;
}

export interface BackofficeDeps {
  readonly eventGridWriter: EventGridWriter;
  readonly clock: Clock;
}

export function createBackofficeServices(deps: BackofficeDeps): BackofficeServices {
  return { createEvent: new CreateEventService({ writer: deps.eventGridWriter, clock: deps.clock }) };
}
