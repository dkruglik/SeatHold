/** One booking as `GET /api/me/bookings` and the guest routes return it. Ticket codes are secrets of their owner: never logged. */
export interface BookingTicket {
  readonly ticketId: string;
  readonly code: string;
  readonly rowLabel: string;
  readonly seatNumber: number;
}

export interface Booking {
  readonly bookingId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly totalMinor: number;
  readonly currency: string;
  readonly event: {
    readonly eventId: string;
    readonly title: string;
    readonly startsAt: string;
    readonly venueName: string;
    readonly city: string;
    readonly timezone: string;
  };
  readonly tickets: readonly BookingTicket[];
}
