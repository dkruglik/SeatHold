/** A guest session as stored: it reads exactly one booking. The token itself is never kept, only its hash. */
export class GuestSession {
  constructor(
    readonly id: string,
    readonly bookingId: string,
    readonly expiresAt: Date,
    readonly createdAt: Date,
  ) {}
}
