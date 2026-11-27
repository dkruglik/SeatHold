/** Read ports of the back office: read models over shared tables, no writes. Adapters live in `infrastructure/persistence`. */

export interface AdminEventRow {
  readonly eventId: string;
  readonly showTitle: string;
  readonly venueName: string;
  readonly city: string;
  /** IANA timezone of the venue, for showing `startsAt` in venue time. */
  readonly timezone: string;
  readonly startsAt: Date;
  readonly priceMinor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seatsPerRow: number;
  readonly sold: number;
  readonly held: number;
  readonly available: number;
}

export interface PageCriteria {
  readonly offset: number;
  readonly limit: number;
}

export interface Rows<T> {
  readonly total: number;
  readonly rows: readonly T[];
}

export interface AdminEventListReader {
  /** Events newest start first (then id), with seat counts for the page. `now` decides which holds are still live. */
  list(criteria: PageCriteria & { readonly now: Date }): Promise<Rows<AdminEventRow>>;
}

export interface LookupShow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly genre: string;
}

export interface LookupVenue {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly countryCode: string;
  readonly timezone: string;
}

export interface AdminLookupsReader {
  /** Shows by title and venues by name, each at most `limit`. */
  load(limit: number): Promise<{ readonly shows: readonly LookupShow[]; readonly venues: readonly LookupVenue[] }>;
}

export interface EventHeader {
  readonly eventId: string;
  readonly showTitle: string;
  readonly startsAt: Date;
  readonly venueName: string;
  readonly city: string;
  readonly timezone: string;
}

export interface OpenTicketRow {
  readonly seatId: string;
  readonly row: string;
  readonly number: number;
  readonly state: "available" | "held";
  readonly heldUntil: Date | null;
}

export interface BoughtTicketRow {
  readonly ticketId: string;
  readonly row: string;
  readonly number: number;
  readonly buyerEmail: string;
  readonly buyerType: "user" | "guest";
  readonly bookedAt: Date;
}

export interface EventTicketsReader {
  findHeader(eventId: string): Promise<EventHeader | null>;
  /** Seats that are available (an expired hold counts as available) or held with `held_until > now`, in row then seat order. */
  listOpen(criteria: PageCriteria & { readonly eventId: string; readonly now: Date }): Promise<Rows<OpenTicketRow>>;
  /** One row per ticket of a confirmed booking, oldest booking first. Never reads ticket codes or payments. */
  listBought(criteria: PageCriteria & { readonly eventId: string }): Promise<Rows<BoughtTicketRow>>;
}
