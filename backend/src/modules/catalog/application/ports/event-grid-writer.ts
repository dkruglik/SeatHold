export type ShowRef =
  | { readonly existingId: string }
  | { readonly new: { readonly title: string; readonly type: string; readonly genre: string; readonly description: string } };

export type VenueRef =
  | { readonly existingId: string }
  | { readonly new: { readonly name: string; readonly city: string; readonly countryCode: string; readonly timezone: string } };

/** An already validated event with its grid: rows labelled A, B, ... Z, AA ... and seats numbered from 1. */
export interface NewEventGrid {
  readonly show: ShowRef;
  readonly venue: VenueRef;
  readonly startsAt: Date;
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
  readonly startsAt: Date;
  readonly priceMinor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seatsPerRow: number;
  readonly seatCount: number;
}

export interface EventGridWriter {
  /**
   * Creates the event and all its seats (status `available`) together with a new show or venue, in one transaction:
   * a failure leaves nothing behind. A new venue whose (name, city) exists is reused. An unknown existing show or venue
   * is a NotFoundError (404).
   */
  create(grid: NewEventGrid): Promise<CreatedEvent>;
}
