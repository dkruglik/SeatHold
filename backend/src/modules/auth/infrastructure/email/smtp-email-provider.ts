import { InfrastructureError } from "../../../../shared/errors/app-error.js";
import type { EmailMessage, EmailProvider } from "../../application/ports/email-provider.js";

/** The part of a nodemailer transporter this adapter uses; tests pass a fake. */
export interface MailTransport {
  sendMail(options: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

/** Only a short upper-case code such as ECONNREFUSED or EAUTH is safe to surface; nodemailer messages can quote the server reply. */
function safeCode(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code: unknown }).code : undefined;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "UNKNOWN";
}

/** Delivers through SMTP (Mailpit locally, the SES SMTP interface in production). */
export class SmtpEmailProvider implements EmailProvider {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
    } catch (error) {
      // No cause is attached: the transport error can carry credentials or the message.
      throw new InfrastructureError(`Email delivery failed (${safeCode(error)})`);
    }
  }
}
