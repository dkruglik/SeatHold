/** A plain text email. Message content (templates) belongs to the use case that sends it. */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Sends one email. Implementations throw InfrastructureError on delivery failure, without credentials or content in the error. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
