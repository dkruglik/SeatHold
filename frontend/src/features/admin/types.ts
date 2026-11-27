export interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface AdminEventRow {
  readonly eventId: string;
  readonly showTitle: string;
  readonly venueName: string;
  readonly city: string;
  /** The venue's IANA zone. Absent from older API responses; the screens then show UTC. */
  readonly timezone?: string;
  readonly startsAt: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seatsPerRow: number;
  readonly seatCount: number;
  readonly sold: number;
  readonly held: number;
  readonly available: number;
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

export interface Lookups {
  readonly shows: readonly LookupShow[];
  readonly venues: readonly LookupVenue[];
}

export interface EventHeader {
  readonly eventId: string;
  readonly showTitle: string;
  readonly venueName?: string;
  readonly city?: string;
  readonly timezone?: string;
  readonly startsAt: string;
}

export interface OpenTicket {
  readonly seatId: string;
  readonly row: string;
  readonly number: number;
  readonly state: "available" | "held";
  readonly heldUntil: string | null;
}

export interface BoughtTicket {
  readonly ticketId: string;
  readonly row: string;
  readonly number: number;
  readonly buyerEmail: string;
  readonly buyerType: "user" | "guest";
  readonly bookedAt: string;
  readonly bookingStatus: string;
}

export interface TicketPage<T> extends Paged<T> {
  readonly event: EventHeader;
}

export interface CreateEventRequest {
  readonly show: { readonly existingId: string } | { readonly new: { readonly title: string; readonly type: string; readonly genre: string; readonly description: string } };
  readonly venue: { readonly existingId: string } | { readonly new: { readonly name: string; readonly city: string; readonly countryCode: string; readonly timezone: string } };
  readonly startsAt: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seatsPerRow: number;
}

export interface CreatedEvent {
  readonly eventId: string;
  readonly showId: string;
  readonly venueId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly seatCount: number;
}

export interface ReleaseResult {
  readonly seatId: string;
  readonly eventId: string;
  readonly released: true;
}
