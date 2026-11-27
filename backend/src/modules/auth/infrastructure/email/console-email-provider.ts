import type { EmailMessage, EmailProvider } from "../../application/ports/email-provider.js";

/**
 * Tests and local debugging only: writes the whole message, body included, to the injected writer.
 * The factory refuses it in production, so the body never reaches production logs.
 */
export class ConsoleEmailProvider implements EmailProvider {
  constructor(private readonly writeLine: (line: string) => void) {}

  send(message: EmailMessage): Promise<void> {
    this.writeLine(`email to=${message.to} subject=${message.subject}\n${message.text}`);
    return Promise.resolve();
  }
}
