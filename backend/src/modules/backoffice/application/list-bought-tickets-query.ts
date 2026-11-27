import { EventNotFound } from "../../catalog/index.js";
import { pagedOf, TICKET_LIST_OFFSET_LIMIT, windowOf, type Paged, type PageInput } from "./page.js";
import type { BoughtTicketRow, EventHeader, EventTicketsReader } from "./ports/admin-readers.js";

export interface BoughtTickets extends Paged<BoughtTicketRow> {
  readonly event: EventHeader;
}

/** One row per ticket of a confirmed booking. Time plays no part, so no clock. */
export class ListBoughtTicketsQuery {
  constructor(private readonly deps: { readonly reader: EventTicketsReader }) {}

  async execute(input: PageInput & { readonly eventId: string }): Promise<BoughtTickets> {
    const event = await this.deps.reader.findHeader(input.eventId);
    if (event === null) throw new EventNotFound();
    const { rows, total } = await this.deps.reader.listBought({ eventId: input.eventId, ...windowOf(input, TICKET_LIST_OFFSET_LIMIT) });
    return { event, ...pagedOf(input, rows, total) };
  }
}
