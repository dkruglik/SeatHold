import { EventNotFound } from "../../catalog/index.js";
import type { Clock } from "../../../shared/time/clock.js";
import { pagedOf, TICKET_LIST_OFFSET_LIMIT, windowOf, type Paged, type PageInput } from "./page.js";
import type { EventHeader, EventTicketsReader, OpenTicketRow } from "./ports/admin-readers.js";

export interface OpenTickets extends Paged<OpenTicketRow> {
  readonly event: EventHeader;
}

/** Seats still open to buyers: available (an expired hold counts as available) or under a live hold. Sold seats are not listed. */
export class ListOpenTicketsQuery {
  constructor(private readonly deps: { readonly reader: EventTicketsReader; readonly clock: Clock }) {}

  async execute(input: PageInput & { readonly eventId: string }): Promise<OpenTickets> {
    const now = await this.deps.clock.now();
    const event = await this.deps.reader.findHeader(input.eventId);
    if (event === null) throw new EventNotFound();
    const { rows, total } = await this.deps.reader.listOpen({ eventId: input.eventId, now, ...windowOf(input, TICKET_LIST_OFFSET_LIMIT) });
    return { event, ...pagedOf(input, rows, total) };
  }
}
