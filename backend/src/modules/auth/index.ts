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
export type { LoginCodeGenerator } from "./application/ports/login-code-generator.js";
export type { LoginCodeHasher } from "./application/ports/login-code-hasher.js";
export {
  RequestLoginCodeService,
  type RequestLoginCodeDeps,
  type RequestLoginCodeInput,
  type RequestLoginCodeLimits,
  type RequestLoginCodeResult,
} from "./application/request-login-code-service.js";
export {
  VerifyLoginCodeService,
  type VerifyLoginCodeDeps,
  type VerifyLoginCodeInput,
  type VerifyLoginCodeResult,
} from "./application/verify-login-code-service.js";
export { HmacLoginCodeHasher } from "./infrastructure/crypto/hmac-login-code-hasher.js";
export { RandomLoginCodeGenerator } from "./infrastructure/crypto/random-login-code-generator.js";
export { isValidEmail } from "./domain/email.js";
export { SessionService, type CreatedSession, type SessionServiceDeps } from "./application/session-service.js";
export { LoginService, type LoginInput, type LoginResult } from "./application/login-service.js";
export type { SessionTokens } from "./application/ports/session-tokens.js";
export { CryptoSessionTokens } from "./infrastructure/crypto/crypto-session-tokens.js";
export { createAuthServices, createPrismaAuthRepositories, type AuthRepositories, type AuthServiceDeps, type AuthServices } from "./auth-composition.js";
export { authPlugin, type AuthPluginOptions } from "./presentation/http/auth-plugin.js";
export { createAuthHooks, type AuthHooks } from "./presentation/http/hooks/require-auth.js";
