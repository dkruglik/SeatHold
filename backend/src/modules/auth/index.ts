// Public API of the auth module.
export type { EmailMessage, EmailProvider } from "./application/ports/email-provider.js";
export { createEmailProvider, type EmailConfig, type EmailProviderDeps } from "./infrastructure/email/create-email-provider.js";
export { emailsEqual, normalizeEmail } from "./domain/email.js";
export { isRole, ROLES, type Role } from "./domain/role.js";
export { User } from "./domain/user.js";
export type { LoginCode } from "./domain/login-code.js";
export type { ActiveSession, Session } from "./domain/session.js";
export type { UserRepository } from "./application/ports/user-repository.js";
export type { LoginCodeRepository, NewLoginCode } from "./application/ports/login-code-repository.js";
export type { NewSession, SessionRepository } from "./application/ports/session-repository.js";
export { PrismaUserRepository } from "./infrastructure/persistence/prisma-user-repository.js";
export { PrismaLoginCodeRepository } from "./infrastructure/persistence/prisma-login-code-repository.js";
export { PrismaSessionRepository } from "./infrastructure/persistence/prisma-session-repository.js";
