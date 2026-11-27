/** A one-time link as stored. The token itself is never kept, only its hash. */
export class GuestAccessLink {
  constructor(
    readonly id: string,
    readonly bookingId: string,
    readonly expiresAt: Date,
    readonly createdAt: Date,
  ) {}
}
