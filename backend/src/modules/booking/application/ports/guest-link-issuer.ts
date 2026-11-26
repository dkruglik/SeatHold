export interface IssueGuestLinkInput {
  readonly bookingId: string;
  readonly email: string;
  readonly eventStartsAt: Date;
  readonly eventTitle: string;
}

/**
 * What checkout needs from guest access: send the buyer a link to the confirmed booking. Booking owns this port;
 * the composition root implements it with the guest-access module, so the modules never import each other's internals.
 */
export interface GuestLinkIssuer {
  issue(input: IssueGuestLinkInput): Promise<void>;
}
