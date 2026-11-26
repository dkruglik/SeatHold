export interface EventVenue {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly countryCode: string;
  /** IANA timezone name; the start time is shown in it. */
  readonly timezone: string;
}

export interface EventDetail {
  readonly eventId: string;
  readonly title: string;
  readonly venue: EventVenue;
  /** ISO instant (UTC). */
  readonly startsAt: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seatsPerRow: number;
  readonly seatsLeft: number;
}

/** The public seat map: the same for every viewer, so a seat I hold shows as `held` here. */
export interface PublicSeat {
  readonly id: string;
  readonly row: string;
  readonly number: number;
  readonly state: "available" | "held" | "sold";
}

export interface PublicSeatMap {
  readonly event: { readonly id: string; readonly priceMinor: number; readonly currency: string };
  readonly seats: readonly PublicSeat[];
}

/** The viewer's live hold on this event. */
export interface CurrentHold {
  readonly seatIds: readonly string[];
  /** ISO instant (UTC). */
  readonly expiresAt: string;
}

/** What the page hands to the next step (checkout). */
export interface HoldSummary {
  readonly eventId: string;
  readonly seatIds: string[];
  readonly expiresAt: string;
}
