import type { Clock } from "../../../shared/time/clock.js";
import { EVENT_LIST_OFFSET_LIMIT, pagedOf, windowOf, type Paged, type PageInput } from "./page.js";
import type { AdminEventListReader, AdminEventRow } from "./ports/admin-readers.js";

/** The admin event list (all events, upcoming and past) with seat counts. The clock is read once and decides which holds are live. */
export class ListAdminEventsQuery {
  constructor(private readonly deps: { readonly reader: AdminEventListReader; readonly clock: Clock }) {}

  async execute(input: PageInput): Promise<Paged<AdminEventRow>> {
    const now = await this.deps.clock.now();
    const { rows, total } = await this.deps.reader.list({ now, ...windowOf(input, EVENT_LIST_OFFSET_LIMIT) });
    return pagedOf(input, rows, total, EVENT_LIST_OFFSET_LIMIT);
  }
}
