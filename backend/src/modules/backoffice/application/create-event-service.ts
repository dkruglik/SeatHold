import type { CreatedEvent, EventGridWriter } from "../../catalog/index.js";
import type { Clock } from "../../../shared/time/clock.js";
import { parseCreateEvent, type RawCreateEvent } from "../domain/create-event-rules.js";

export interface CreateEventDeps {
  readonly writer: EventGridWriter;
  readonly clock: Clock;
}

/** Creates an event with its generated seat grid. Validates first; the catalog writer does everything in one transaction. */
export class CreateEventService {
  constructor(private readonly deps: CreateEventDeps) {}

  async execute(input: RawCreateEvent): Promise<CreatedEvent> {
    const grid = parseCreateEvent(input, await this.deps.clock.now());
    return this.deps.writer.create(grid);
  }
}
