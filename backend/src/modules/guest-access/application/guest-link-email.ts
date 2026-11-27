import type { EmailMessage } from "../../auth/index.js";

export interface GuestLinkEmailInput {
  readonly to: string;
  readonly eventTitle: string;
  readonly eventStartsAt: Date;
  readonly link: string;
  readonly ttlHours: number;
}

/** The ticket access email (plain text, like every email the provider port carries). The link is the only secret in it. */
export function guestLinkEmail(input: GuestLinkEmailInput): EmailMessage {
  return {
    to: input.to,
    subject: `Your SeatHold tickets for ${input.eventTitle}`,
    text: [
      `Your booking for ${input.eventTitle} is confirmed.`,
      `The event starts at ${input.eventStartsAt.toISOString()} (UTC).`,
      "",
      "Open your tickets with this link:",
      input.link,
      "",
      `The link works once and expires in ${input.ttlHours} hours.`,
      "If it no longer works, request a new link on the SeatHold website with this email address.",
    ].join("\n"),
  };
}
