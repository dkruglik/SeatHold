import nodemailer from "nodemailer";
import type { AppConfig } from "../../../../config/load-config.js";
import type { EmailProvider } from "../../application/ports/email-provider.js";
import { ConsoleEmailProvider } from "./console-email-provider.js";
import { type MailTransport, SmtpEmailProvider } from "./smtp-email-provider.js";

export type EmailConfig = Pick<AppConfig, "appEnv" | "emailProvider" | "emailFrom" | "smtpHost" | "smtpPort"> &
  Partial<Pick<AppConfig, "smtpUser" | "smtpPass">>;

export interface EmailProviderDeps {
  /** Where the console provider writes (tests and local only). */
  readonly writeLine: (line: string) => void;
  /** Replaces the SMTP transport; tests pass a fake. */
  readonly transporter?: MailTransport;
}

/** Picks the provider from configuration. `console` in production throws (loadConfig refuses it too). */
export function createEmailProvider(config: EmailConfig, deps: EmailProviderDeps): EmailProvider {
  if (config.emailProvider === "console") {
    if (config.appEnv === "production") {
      throw new Error("EMAIL_PROVIDER is not allowed in production: choose smtp");
    }
    return new ConsoleEmailProvider(deps.writeLine);
  }
  const transporter = deps.transporter ?? nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    ...(config.smtpUser !== undefined && config.smtpPass !== undefined ? { auth: { user: config.smtpUser, pass: config.smtpPass } } : {}),
  });
  return new SmtpEmailProvider(transporter, config.emailFrom);
}
