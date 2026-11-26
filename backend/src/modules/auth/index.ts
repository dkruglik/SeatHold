// Public API of the auth module.
export type { EmailMessage, EmailProvider } from "./application/ports/email-provider.js";
export { createEmailProvider, type EmailConfig, type EmailProviderDeps } from "./infrastructure/email/create-email-provider.js";
