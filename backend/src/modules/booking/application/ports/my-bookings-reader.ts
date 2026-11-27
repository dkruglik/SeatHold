export interface StoredMyBooking {
  readonly bookingId: string;
  readonly createdAt: Date;
  readonly totalMinor: number;
  readonly currency: string;
  readonly event: {
    readonly eventId: string;
    readonly title: string;
    readonly startsAt: Date;
    readonly venueName: string;
    readonly city: string;
    readonly timezone: string;
  };
}

export interface StoredMyTicket {
  readonly ticketId: string;
  readonly bookingId: string;
  readonly code: string;
  readonly rowLabel: string;
  readonly seatNumber: number;
}

export interface StoredMyBookings {
  /** Newest first. */
  readonly bookings: readonly StoredMyBooking[];
  /** The tickets of exactly those bookings, in no promised order. */
  readonly tickets: readonly StoredMyTicket[];
}

export interface MyBookingsReader {
  /** At most `limit` of the user's `confirmed` bookings, newest first, with their tickets. The ownership filter is part of the query, in at most two statements. */
  listConfirmed(userId: string, limit: number): Promise<StoredMyBookings>;
}
